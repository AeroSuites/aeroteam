-- ============================================================
-- Managers masquables à l'inscription
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Certains administrateurs ne sont pas managers : ils peuvent
-- être masqués de la liste proposée aux inscriptions (AeroTeam
-- et AeroPrimes). La bascule se fait dans Administration.
-- ============================================================

alter table public.admins
  add column if not exists listable boolean not null default true;

-- 1) Liste des managers pour les inscriptions : uniquement les visibles
create or replace function public.list_managers()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'managers',
    coalesce(jsonb_agg(t order by t.name), '[]'::jsonb))
  from (
    select id::text as id, coalesce(nullif(trim(name), ''), 'Manager') as name
    from public.admins
    where listable = true
  ) t;
$$;

-- 2) Liste administrateurs (avec id + visibilité)
create or replace function public.admin_list_admins(p_admin_code text)
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
    select id::text as id, name, listable
    from public.admins
  ) t;

  return jsonb_build_object('ok', true, 'admins', list);
end;
$$;

-- 3) Masquer / afficher un administrateur dans la liste d'inscription
create or replace function public.admin_set_admin_listable(
  p_admin_code text,
  p_target_id uuid,
  p_listable boolean
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

  if coalesce(p_listable, true) = false then
    if not exists (
      select 1 from public.admins
      where listable = true and id <> p_target_id
    ) then
      return jsonb_build_object('error', 'dernier_visible');
    end if;
  end if;

  update public.admins
  set listable = coalesce(p_listable, true)
  where id = p_target_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
