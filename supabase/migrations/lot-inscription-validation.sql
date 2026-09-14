-- ============================================================
-- Inscription libre avec validation admin + affectation des
-- consignes à des profils existants
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- 1) Nouveau statut de profil : valide (défaut) / en_attente
-- 2) Inscription libre : nom + code uniquement, puis validation
--    par un administrateur avant connexion
-- 3) Email d'alerte aux administrateurs à chaque inscription
-- 4) Affectation d'un avion + consignes à un profil existant
-- ============================================================

-- 1) Statut des profils (les profils existants restent validés)
--    + rattachement de chaque profil à son manager
alter table public.profiles
  add column if not exists statut text not null default 'valide';

alter table public.profiles
  add column if not exists manager_id uuid;

-- 2) Demande d'inscription (publique, sans avion) : en attente,
--    adressée au manager choisi dans la liste
create or replace function public.request_profile(
  p_code text,
  p_name text,
  p_manager_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c text;
begin
  c := trim(p_code);

  if length(coalesce(c, '')) < 8 then
    return jsonb_build_object('error', 'code_too_short');
  end if;

  if length(coalesce(trim(p_name), '')) = 0 then
    return jsonb_build_object('error', 'nom_requis');
  end if;

  if p_manager_id is null
     or not exists (select 1 from public.admins where id = p_manager_id) then
    return jsonb_build_object('error', 'manager_requis');
  end if;

  if exists (select 1 from public.profiles where code = c) then
    return jsonb_build_object('error', 'code_exists');
  end if;

  if exists (select 1 from public.admins where crypt(c, code_hash) = code_hash) then
    return jsonb_build_object('error', 'code_reserve');
  end if;

  insert into public.profiles (code, name, aircraft, data, statut, manager_id)
  values (c, trim(p_name), '', '{}'::jsonb, 'en_attente', p_manager_id);

  return jsonb_build_object('ok', true, 'statut', 'en_attente');
end;
$$;

-- 3) Connexion : un profil en attente est signalé comme tel
create or replace function public.profile_exists(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st text;
begin
  if public.too_many_attempts('profile', p_code) then
    return jsonb_build_object('ok', false, 'locked', true);
  end if;

  select statut into st from public.profiles where code = p_code;

  if st = 'valide' then
    perform public.clear_attempts('profile', p_code);
    return jsonb_build_object('ok', true, 'locked', false);
  end if;

  if st = 'en_attente' then
    return jsonb_build_object('ok', false, 'locked', false, 'pending', true);
  end if;

  perform public.record_failed_attempt('profile', p_code);
  return jsonb_build_object('ok', false, 'locked', false);
end;
$$;

-- 4) Chargement du profil : les profils en attente sont bloqués
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
    select id::text as id, name, aircraft, rev, updated_at, data, statut
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

-- 5) La liste admin n'expose que les profils validés
--    (les demandes en attente sont gérées dans une liste dédiée).
--    Le code est renvoyé aux ADMINISTRATEURS uniquement : il sert à
--    l'affectation des consignes à un profil existant lors de l'import.
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
    select id::text as id, code, name, aircraft, created_at
    from public.profiles
    where statut = 'valide'
  ) t;

  return jsonb_build_object('ok', true, 'profiles', list);
end;
$$;

-- 6) Liste des demandes d'accès en attente : chaque manager ne voit
--    que les demandes qui lui sont adressées (les demandes sans manager
--    ou dont le manager a été supprimé restent visibles par tous)
create or replace function public.admin_list_pending_profiles(p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  list jsonb;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
  into list
  from (
    select p.id::text as id, p.code, p.name, p.created_at
    from public.profiles p
    where p.statut = 'en_attente'
      and (p.manager_id is null
           or p.manager_id = v_admin_id
           or not exists (select 1 from public.admins m where m.id = p.manager_id))
  ) t;

  return jsonb_build_object('ok', true, 'pending', list);
end;
$$;

-- 7) Valider une demande d'accès (uniquement dans son périmètre)
create or replace function public.admin_validate_profile(
  p_admin_code text,
  p_profile_code text
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
  set statut = 'valide'
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

-- 8) Refuser une demande d'accès (uniquement dans son périmètre)
create or replace function public.admin_refuse_profile(
  p_admin_code text,
  p_profile_code text
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

  delete from public.login_attempts where code = trim(p_profile_code);

  delete from public.profiles p
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

-- 9) Affecter un avion à un profil existant (import consignes)
create or replace function public.admin_set_profile_aircraft(
  p_admin_code text,
  p_profile_code text,
  p_aircraft text
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
  set aircraft = trim(coalesce(p_aircraft, ''))
  where code = trim(p_profile_code);

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 10) Email d'alerte à chaque inscription : au manager concerné
--     (tous les administrateurs si la demande n'a pas de manager)
create or replace function public.notify_admin_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  adm record;
  manager_email text;
  manager_name text;
  html text;
begin
  html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
    || '<h2 style="margin:0 0 10px">Nouvelle demande d''accès AeroTeam</h2>'
    || '<p style="margin:4px 0"><b>Profil demandé :</b> ' || coalesce(new.name, '') || '</p>'
    || '<p style="margin:4px 0"><b>Le :</b> ' || to_char(now(), 'DD/MM/YYYY à HH24:MI') || '</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>'
    || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
    || '<a href="https://aerosuites.github.io/aeroteam/#/admin" style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">Ouvrir AeroTeam &#8594; Administration</a>'
    || '</td></tr></table>'
    || '</div>';

  select a.email, a.name into manager_email, manager_name
  from public.admins a
  where a.id = new.manager_id;

  if manager_email is not null and length(trim(manager_email)) > 0 then
    perform public.send_manager_email_(
      p_to := manager_email,
      p_to_name := coalesce(manager_name, ''),
      p_subject := 'Nouvelle demande d''accès — ' || coalesce(new.name, ''),
      p_html := html
    );
  else
    for adm in (
      select email, name from public.admins
      where coalesce(trim(email), '') <> ''
    ) loop
      perform public.send_manager_email_(
        p_to := adm.email,
        p_to_name := coalesce(adm.name, ''),
        p_subject := 'Nouvelle demande d''accès — ' || coalesce(new.name, ''),
        p_html := html
      );
    end loop;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_new_registration on public.profiles;

create trigger trg_notify_admin_new_registration
after insert on public.profiles
for each row
when (new.statut = 'en_attente')
execute function public.notify_admin_new_registration();
