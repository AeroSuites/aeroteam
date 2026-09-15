-- ============================================================
-- Transfert d'un profil vers un autre manager
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Un manager peut réaffecter un profil de son périmètre (ou non
-- assigné) à un autre manager. Chaque profil peut aussi être
-- remis « non assigné ».
-- ============================================================

-- 1) Liste des profils : avec le manager en charge
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
    select p.id::text as id, p.code, p.identifiant, p.name, p.aircraft, p.created_at,
           p.manager_id::text as manager_id,
           coalesce(m.name, '') as manager_nom
    from public.profiles p
    left join public.admins m on m.id = p.manager_id
    where p.statut = 'valide'
  ) t;

  return jsonb_build_object('ok', true, 'profiles', list);
end;
$$;

-- 2) Transférer la gestion d'un profil à un autre manager
create or replace function public.admin_set_profile_manager(
  p_admin_code text,
  p_profile_id uuid,
  p_manager_id uuid
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

  if p_manager_id is not null
     and not exists (select 1 from public.admins where id = p_manager_id) then
    return jsonb_build_object('error', 'manager_inconnu');
  end if;

  update public.profiles p
  set manager_id = p_manager_id
  where p.id = p_profile_id
    and (p.manager_id is null
         or p.manager_id = v_admin_id
         or not exists (select 1 from public.admins m where m.id = p.manager_id));

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
