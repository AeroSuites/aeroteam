-- ============================================================
-- TRFX sur les déclarations de primes — v3
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Le TRFX (code-barres de la tâche) est enregistré avec la
-- déclaration du leader et affiché dans l'historique manager.
-- ============================================================

-- 1) Colonne TRFX
alter table public.declarations
  add column if not exists trfx text not null default '';

-- 2) Déclaration leader : TRFX transmis avec la tâche
drop function if exists public.leader_submit_prime(text, text, text, text, text, date, text, uuid);

create or replace function public.leader_submit_prime(
  p_leader_code text,
  p_beneficiaire text,
  p_identifiant text,
  p_element text,
  p_trfx text,
  p_avion text,
  p_date date,
  p_description text,
  p_manager_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_leader_id uuid;
  v_manager uuid;
  ident text;
begin
  select id, manager_id into v_leader_id, v_manager
  from public.profiles
  where code = trim(coalesce(p_leader_code, ''))
    and statut = 'valide';

  if v_leader_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if length(coalesce(trim(p_beneficiaire), '')) = 0 then
    return jsonb_build_object('error', 'beneficiaire_requis');
  end if;

  if length(coalesce(trim(p_element), '')) = 0 then
    return jsonb_build_object('error', 'tache_requise');
  end if;

  if length(coalesce(trim(p_avion), '')) = 0 then
    return jsonb_build_object('error', 'avion_requis');
  end if;

  if p_date is null then
    return jsonb_build_object('error', 'date_requise');
  end if;

  if p_manager_id is not null then
    if not exists (select 1 from public.admins where id = p_manager_id) then
      return jsonb_build_object('error', 'manager_inconnu');
    end if;
    v_manager := p_manager_id;
  elsif v_manager is null then
    return jsonb_build_object('error', 'manager_requis');
  end if;

  ident := lower(regexp_replace(trim(coalesce(p_identifiant, '')), '[^a-zA-Z0-9._-]+', '.', 'g'));
  ident := trim(both '.' from ident);
  if ident = '' then
    ident := lower(regexp_replace(trim(p_beneficiaire), '[^a-zA-Z0-9]+', '.', 'g'));
    ident := trim(both '.' from ident);
    if ident = '' then
      ident := 'beneficiaire';
    end if;
  end if;

  insert into public.declarations (
    agent_identifiant, agent_nom, avion, element, trfx,
    date_intervention, description, montant, statut, manager_id
  )
  values (
    ident,
    trim(p_beneficiaire),
    trim(p_avion),
    trim(p_element),
    trim(coalesce(p_trfx, '')),
    p_date,
    coalesce(p_description, ''),
    null,
    'soumise',
    v_manager
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- 3) Liste manager : expose le TRFX
create or replace function public.admin_list_declarations(
  p_admin_code text,
  p_statut text default ''
)
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

  if p_statut = '' then
    select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into list
    from (
      select d.id::text as id, d.agent_identifiant, d.agent_nom, d.avion, d.element,
             d.trfx, d.date_intervention, d.description, d.categorie, d.montant,
             d.statut, d.motif_refus, d.decided_by, d.decided_at, d.created_at
      from public.declarations d
      where d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id)
    ) t;
  else
    select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into list
    from (
      select d.id::text as id, d.agent_identifiant, d.agent_nom, d.avion, d.element,
             d.trfx, d.date_intervention, d.description, d.categorie, d.montant,
             d.statut, d.motif_refus, d.decided_by, d.decided_at, d.created_at
      from public.declarations d
      where d.statut = p_statut
        and (d.manager_id is null
             or d.manager_id = v_admin_id
             or not exists (select 1 from public.admins a where a.id = d.manager_id))
    ) t;
  end if;

  return jsonb_build_object('ok', true, 'declarations', list);
end;
$$;
