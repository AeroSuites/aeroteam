-- ============================================================
-- Connexion par IDENTIFIANT + code
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- - chaque profil reçoit un identifiant unique (généré depuis le
--   nom pour les profils existants, choisi à l'inscription ensuite)
-- - la connexion vérifie le COUPLE identifiant + code : découvrir
--   un code par énumération ne suffit plus
-- ============================================================

-- 1) Colonne identifiant
alter table public.profiles
  add column if not exists identifiant text;

-- 2) Génère un identifiant libre depuis un nom (slug unique)
create or replace function public.generate_identifiant_(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  base := lower(regexp_replace(coalesce(nullif(trim(p_name), ''), 'profil'), '[^a-zA-Z0-9]+', '.', 'g'));
  base := trim(both '.' from base);
  if base = '' then
    base := 'profil';
  end if;

  candidate := base;
  while exists (
    select 1 from public.profiles where lower(identifiant) = candidate
  ) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  return candidate;
end;
$$;

-- 3) Remplissage des profils existants
update public.profiles p
set identifiant = t.new_id
from (
  select id,
         slug || case when rn > 1 then rn::text else '' end as new_id
  from (
    select id,
           coalesce(
             nullif(
               trim(both '.' from lower(regexp_replace(
                 coalesce(nullif(trim(name), ''), 'profil'),
                 '[^a-zA-Z0-9]+', '.', 'g'
               ))),
               ''
             ),
             'profil'
           ) as slug,
           row_number() over (
             partition by coalesce(
               nullif(
                 trim(both '.' from lower(regexp_replace(
                   coalesce(nullif(trim(name), ''), 'profil'),
                   '[^a-zA-Z0-9]+', '.', 'g'
                 ))),
                 ''
               ),
               'profil'
             )
             order by created_at, id
           ) as rn
    from public.profiles
    where identifiant is null
  ) s
) t
where p.id = t.id
  and p.identifiant is null;

-- Unicité (insensible à la casse) + non nul
create unique index if not exists profiles_identifiant_key
  on public.profiles (lower(identifiant));

alter table public.profiles
  alter column identifiant set not null;

-- 4) Connexion : le couple identifiant + code est vérifié
drop function if exists public.profile_exists(text);

create or replace function public.profile_exists(
  p_identifiant text,
  p_code text
)
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

  select statut into st
  from public.profiles
  where lower(identifiant) = lower(trim(coalesce(p_identifiant, '')))
    and code = p_code;

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

-- 5) Chargement du profil : même couple
drop function if exists public.get_profile(text);

create or replace function public.get_profile(
  p_identifiant text,
  p_code text
)
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
    select id::text as id, identifiant, name, aircraft, rev, updated_at, data, statut
    from public.profiles
    where lower(identifiant) = lower(trim(coalesce(p_identifiant, '')))
      and code = p_code
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

-- 6) Inscription profil : identifiant choisi + code générique masqué
drop function if exists public.request_profile(text, text, uuid);

create or replace function public.request_profile(
  p_identifiant text,
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
  ident text;
  v_ip text;
begin
  delete from public.login_attempts where attempted_at < now() - interval '1 day';

  v_ip := public.client_ip_();
  if (
    select count(*) from public.login_attempts
    where purpose = 'signup' and code = v_ip
      and attempted_at > now() - interval '15 minutes'
  ) >= 15 then
    return jsonb_build_object('error', 'trop_de_tentatives');
  end if;
  perform public.record_failed_attempt('signup', v_ip);

  ident := lower(regexp_replace(trim(coalesce(p_identifiant, '')), '[^a-zA-Z0-9._-]+', '.', 'g'));
  ident := trim(both '.' from ident);

  if length(ident) < 3 then
    return jsonb_build_object('error', 'identifiant_court');
  end if;

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

  if exists (select 1 from public.profiles where lower(identifiant) = ident) then
    return jsonb_build_object('error', 'identifiant_indisponible');
  end if;

  -- Message GÉNÉRIQUE : impossible de savoir si le code existe
  -- (profil ou admin) — l'identifiant + code protège la connexion.
  if exists (select 1 from public.profiles where code = c)
     or exists (select 1 from public.admins where crypt(c, code_hash) = code_hash) then
    return jsonb_build_object('error', 'code_indisponible');
  end if;

  insert into public.profiles (identifiant, code, name, aircraft, data, statut, manager_id)
  values (ident, c, trim(p_name), '', '{}'::jsonb, 'en_attente', p_manager_id);

  return jsonb_build_object('ok', true, 'statut', 'en_attente');
end;
$$;

-- 7) Création admin : identifiant optionnel (généré si vide)
drop function if exists public.create_profile(text, text, text);

create or replace function public.create_profile(
  p_identifiant text,
  p_code text,
  p_name text,
  p_aircraft text
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

  insert into public.profiles (identifiant, code, name, aircraft, data)
  values (ident, p_code, p_name, p_aircraft, '{}'::jsonb)
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id, 'identifiant', ident, 'code', p_code,
    'name', p_name, 'aircraft', p_aircraft, 'rev', 0
  );
end;
$$;

-- 8) Création admin (import) : identifiant généré depuis le nom
create or replace function public.admin_create_profile(
  p_admin_code text,
  p_code text,
  p_name text,
  p_aircraft text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  new_id uuid;
  ident text;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  if exists (select 1 from public.profiles where code = p_code) then
    return jsonb_build_object('error', 'code_exists');
  end if;

  ident := public.generate_identifiant_(p_name);

  insert into public.profiles (identifiant, code, name, aircraft, data)
  values (ident, trim(p_code), coalesce(p_name, ''), coalesce(p_aircraft, ''), '{}'::jsonb)
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'identifiant', ident, 'rev', 0);
end;
$$;

-- 9) Liste admin : expose l'identifiant (pour l'affichage)
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
    select id::text as id, code, identifiant, name, aircraft, created_at
    from public.profiles
    where statut = 'valide'
  ) t;

  return jsonb_build_object('ok', true, 'profiles', list);
end;
$$;

-- 10) Vérification administrateur : existe-t-il un profil pour ce code ?
--     (réservé aux admins — pas d'énumération publique possible)
create or replace function public.admin_profile_lookup(
  p_admin_code text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  result jsonb;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select to_jsonb(t) into result
  from (
    select identifiant, name, aircraft
    from public.profiles
    where code = trim(coalesce(p_code, ''))
  ) t;

  if result is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'profile', result);
end;
$$;
