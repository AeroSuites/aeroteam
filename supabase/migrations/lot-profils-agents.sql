-- ============================================================
-- Profils AGENTS : rôle leader/agent, envoi de charge par un
-- leader, suivi de l'avancement par le leader.
-- À exécuter dans Supabase (SQL Editor).
-- ============================================================

-- 1) Rôle du profil : leader (défaut) ou agent
alter table public.profiles
  add column if not exists type text not null default 'leader';

-- 2) Connexion : renvoyer le rôle avec le profil
create or replace function public.get_profile(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  st text;
begin
  if public.too_many_attempts('profile', p_code) then
    return jsonb_build_object('error', 'locked');
  end if;

  select to_jsonb(t), t.statut into result, st
  from (
    select id::text as id, name, aircraft, rev, updated_at, data, statut, type
    from public.profiles
    where code = p_code
  ) t;

  if result is not null and st = 'en_attente' then
    return jsonb_build_object('error', 'pending');
  end if;

  if result is not null then
    perform public.clear_attempts('profile', p_code);
    return result;
  end if;

  perform public.record_failed_attempt('profile', p_code);
  return jsonb_build_object('error', 'not_found');
end;
$$;

grant execute on function public.get_profile(text) to anon, authenticated;

-- 3) Liste admin : renvoyer aussi le rôle
create or replace function public.admin_list_profiles(p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  list jsonb;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb)
  into list
  from (
    select id::text as id, code, name, aircraft, created_at, type
    from public.profiles
    where statut = 'valide'
  ) t;

  return jsonb_build_object('ok', true, 'profiles', list);
end;
$$;

-- 4) Validation d'une inscription : l'admin choisit le rôle
drop function if exists public.admin_validate_profile(text, text);

create or replace function public.admin_validate_profile(
  p_admin_code text,
  p_profile_code text,
  p_type text default 'leader'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  update public.profiles p
  set statut = 'valide',
      type = case when lower(coalesce(p_type, 'leader')) = 'agent' then 'agent' else 'leader' end
  where p.code = trim(p_profile_code)
    and p.statut = 'en_attente'
    and (p.manager_id is null
         or p.manager_id = v_admin_id
         or not exists (select 1 from public.admins m where m.id = p.manager_id));

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_validate_profile(text, text, text) to anon, authenticated;

-- 5) Changer le rôle d'un profil existant
create or replace function public.admin_set_profile_type(
  p_admin_code text,
  p_id uuid,
  p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  update public.profiles
  set type = case when lower(coalesce(p_type, '')) = 'agent' then 'agent' else 'leader' end,
      rev = rev + 1,
      updated_at = now()
  where id = p_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_set_profile_type(text, uuid, text) to anon, authenticated;

-- 6) Création d'un profil : rôle au choix
drop function if exists public.admin_create_profile(text, text, text, text);

create or replace function public.admin_create_profile(
  p_admin_code text,
  p_code text,
  p_name text,
  p_aircraft text,
  p_type text default 'leader'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  new_id uuid;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  if length(coalesce(p_code, '')) = 0 then
    return jsonb_build_object('error', 'code_requis');
  end if;

  if exists (select 1 from public.profiles where code = p_code) then
    return jsonb_build_object('error', 'code_exists');
  end if;

  insert into public.profiles (code, name, aircraft, data, type)
  values (
    trim(p_code),
    coalesce(p_name, ''),
    coalesce(p_aircraft, ''),
    '{}'::jsonb,
    case when lower(coalesce(p_type, 'leader')) = 'agent' then 'agent' else 'leader' end
  )
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'rev', 0);
end;
$$;

grant execute on function public.admin_create_profile(text, text, text, text, text) to anon, authenticated;

-- 7) Création d'un profil (inscription) : rôle au choix
drop function if exists public.create_profile(text, text, text, text);

create or replace function public.create_profile(
  p_identifiant text,
  p_code text,
  p_name text,
  p_aircraft text,
  p_type text default 'leader'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
  ident text;
begin
  if length(coalesce(p_code, '')) < 8 then
    return jsonb_build_object('error', 'code_too_short');
  end if;

  if exists (select 1 from public.profiles where code = p_code) then
    return jsonb_build_object('error', 'code_exists');
  end if;

  ident := lower(regexp_replace(trim(coalesce(p_identifiant, '')), '[^a-zA-Z0-9._-]+', '.', 'g'));
  ident := trim(both '.' from ident);

  if ident = '' then
    ident := public.generate_identifiant_(p_name);
  elsif exists (select 1 from public.profiles where lower(identifiant) = ident) then
    return jsonb_build_object('error', 'identifiant_indisponible');
  end if;

  insert into public.profiles (identifiant, code, name, aircraft, data, type)
  values (
    ident,
    p_code,
    p_name,
    p_aircraft,
    '{}'::jsonb,
    case when lower(coalesce(p_type, 'leader')) = 'agent' then 'agent' else 'leader' end
  )
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id, 'identifiant', ident, 'code', p_code,
    'name', p_name, 'aircraft', p_aircraft, 'rev', 0
  );
end;
$$;

grant execute on function public.create_profile(text, text, text, text, text) to anon, authenticated;

-- 8) Liste des profils agents (pour l'envoi de charge)
create or replace function public.leader_list_agents(p_leader_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  list jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where code = trim(p_leader_code) and statut = 'valide'
  ) then
    return jsonb_build_object('error', 'not_found');
  end if;

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb)
  into list
  from (
    select id::text as id, name, aircraft
    from public.profiles
    where type = 'agent' and statut = 'valide'
  ) t;

  return jsonb_build_object('ok', true, 'agents', list);
end;
$$;

grant execute on function public.leader_list_agents(text) to anon, authenticated;

-- 9) Envoi / mise à jour de la charge d'un agent
--    (la charge précédente part dans l'historique, 10 max)
create or replace function public.leader_send_charge(
  p_leader_code text,
  p_agent_id uuid,
  p_charge jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader public.profiles%rowtype;
  v_agent public.profiles%rowtype;
  v_history jsonb;
begin
  select * into v_leader
  from public.profiles
  where code = trim(p_leader_code) and statut = 'valide';

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_agent from public.profiles where id = p_agent_id;

  if not found then
    return jsonb_build_object('error', 'agent_introuvable');
  end if;

  if v_agent.type <> 'agent' then
    return jsonb_build_object('error', 'pas_un_agent');
  end if;

  if p_charge is null or jsonb_typeof(p_charge) <> 'object' then
    return jsonb_build_object('error', 'charge_invalide');
  end if;

  v_history := coalesce(v_agent.data->'chargeHistory', '[]'::jsonb);

  if v_agent.data ? 'charge' then
    v_history := jsonb_build_array(v_agent.data->'charge') || v_history;
    if jsonb_array_length(v_history) > 10 then
      v_history := (
        select coalesce(jsonb_agg(e), '[]'::jsonb)
        from (
          select e
          from jsonb_array_elements(v_history) with ordinality as t(e, ord)
          where ord <= 10
        ) s
      );
    end if;
  end if;

  update public.profiles
  set data = coalesce(data, '{}'::jsonb)
             || jsonb_build_object(
                  'charge',
                  p_charge || jsonb_build_object(
                    'leaderId', v_leader.id::text,
                    'leaderName', v_leader.name,
                    'sentAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')
                  ),
                  'chargeHistory', v_history
                ),
      rev = rev + 1,
      updated_at = now()
  where id = v_agent.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leader_send_charge(text, uuid, jsonb) to anon, authenticated;

-- 10) Suivi : avancement des agents qui ont une charge de ce leader
create or replace function public.leader_get_agents_progress(p_leader_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader_id uuid;
  list jsonb;
begin
  select id into v_leader_id
  from public.profiles
  where code = trim(p_leader_code) and statut = 'valide';

  if v_leader_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb)
  into list
  from (
    select
      p.id::text as id,
      p.name,
      p.updated_at,
      p.data->'charge'->>'date' as date,
      p.data->'charge'->>'aircraft' as aircraft,
      p.data->'charge'->>'teamName' as "teamName",
      p.data->'charge'->>'sentAt' as "sentAt",
      coalesce(p.data->'charge'->'tasks', '[]'::jsonb) as tasks
    from public.profiles p
    where p.type = 'agent'
      and p.statut = 'valide'
      and p.data->'charge'->>'leaderId' = v_leader_id::text
  ) t;

  return jsonb_build_object('ok', true, 'agents', list);
end;
$$;

grant execute on function public.leader_get_agents_progress(text) to anon, authenticated;
