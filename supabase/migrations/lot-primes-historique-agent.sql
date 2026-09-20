-- ============================================================
-- Primes - historique agent protege lors des suppressions manager
-- A executer UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Regle : quand une declaration est rattachee a un compte AeroPrimes,
-- la "suppression" cote manager ne fait que la MASQUER de la vue
-- manager (l'agent conserve tout son historique dans AeroPrimes).
-- Les declarations sans compte rattache sont supprimees pour de vrai.
-- ============================================================

-- 1) Colonne de masquage cote manager
alter table public.declarations
  add column if not exists manager_hidden boolean not null default false;

-- 2) Liste manager : exclut les declarations masquees cote manager
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
      where coalesce(d.manager_hidden, false) = false
        and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id))
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
        and coalesce(d.manager_hidden, false) = false
        and (d.manager_id is null
             or d.manager_id = v_admin_id
             or not exists (select 1 from public.admins a where a.id = d.manager_id))
    ) t;
  end if;

  return jsonb_build_object('ok', true, 'declarations', list);
end;
$$;

-- 3) Supprimer une demande : masquee si rattachee a un compte, sinon supprimee
create or replace function public.admin_delete_declaration(
  p_admin_code text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  v_ident text;
  v_linked boolean;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  select d.agent_identifiant into v_ident
  from public.declarations d
  where d.id = p_id
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id))
  limit 1;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select exists (
    select 1 from public.agents ag
    where lower(ag.identifiant) = lower(coalesce(v_ident, ''))
  ) into v_linked;

  if v_linked then
    update public.declarations set manager_hidden = true where id = p_id;
    return jsonb_build_object('ok', true, 'hidden', true);
  end if;

  delete from public.declarations where id = p_id;
  return jsonb_build_object('ok', true, 'hidden', false);
end;
$$;

-- 4) Supprimer tout l'historique d'un agent : masque si compte, supprime sinon
create or replace function public.admin_delete_agent_declarations(
  p_admin_code text,
  p_identifiant text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  v_linked boolean;
  n integer;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  select exists (
    select 1 from public.agents ag
    where lower(ag.identifiant) = lower(trim(p_identifiant))
  ) into v_linked;

  if v_linked then
    update public.declarations d
    set manager_hidden = true
    where lower(d.agent_identifiant) = lower(trim(p_identifiant))
      and coalesce(d.manager_hidden, false) = false
      and (d.manager_id is null
           or d.manager_id = v_admin_id
           or not exists (select 1 from public.admins a where a.id = d.manager_id));
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'count', n, 'hidden', true);
  end if;

  delete from public.declarations d
  where lower(d.agent_identifiant) = lower(trim(p_identifiant))
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id));

  get diagnostics n = row_count;

  return jsonb_build_object('ok', true, 'count', n, 'hidden', false);
end;
$$;

grant execute on function public.admin_list_declarations(text, text) to anon, authenticated;
grant execute on function public.admin_delete_declaration(text, uuid) to anon, authenticated;
grant execute on function public.admin_delete_agent_declarations(text, text) to anon, authenticated;
