-- ============================================================
-- Primes — suppression des demandes par le manager
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Le manager peut supprimer une demande (nettoyage, tests,
-- anciens agents sans compte…) ou tout l'historique d'un agent.
-- Toujours limité à son périmètre.
-- ============================================================

-- 1) Supprimer une demande de prime
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
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  delete from public.declarations d
  where d.id = p_id
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id));

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 2) Supprimer tout l'historique d'un agent
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

  delete from public.declarations d
  where lower(d.agent_identifiant) = lower(trim(p_identifiant))
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id));

  get diagnostics n = row_count;

  return jsonb_build_object('ok', true, 'count', n);
end;
$$;
