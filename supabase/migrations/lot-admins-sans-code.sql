-- ============================================================
-- Administrateurs - promotion / retrait sans saisir le code de la personne
-- A executer UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Avant : pour promouvoir (ou retirer) un administrateur, il fallait
-- saisir le code personnel de la personne (mauvais pour la securite :
-- un code personnel ne doit jamais etre partage/saisi par un autre).
-- Maintenant : on selectionne le profil dans la liste ; le serveur
-- utilise le code stocke cote base (jamais affiche, jamais transmis).
-- ============================================================

-- Promotion par identifiant de profil
create or replace function public.admin_add_admin_by_id(
  p_admin_code text,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_profile record;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id, name, code into v_profile
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_profile.id is null then
    return jsonb_build_object('error', 'profil_introuvable');
  end if;

  if exists (
    select 1 from public.admins
    where crypt(v_profile.code, code_hash) = code_hash
  ) then
    return jsonb_build_object('error', 'deja_admin');
  end if;

  insert into public.admins (code_hash, name)
  values (crypt(v_profile.code, gen_salt('bf')), v_profile.name);

  return jsonb_build_object('ok', true);
end;
$$;

-- Retrait par identifiant d'administrateur (sans son code)
create or replace function public.admin_remove_admin_by_id(
  p_admin_code text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  total integer;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select count(*) into total from public.admins;
  if total <= 1 then
    return jsonb_build_object('error', 'dernier_admin');
  end if;

  delete from public.admins where id = p_target_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_add_admin_by_id(text, uuid) to anon, authenticated;
grant execute on function public.admin_remove_admin_by_id(text, uuid) to anon, authenticated;
