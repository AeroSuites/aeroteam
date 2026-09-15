-- ============================================================
-- Sécurité inscription — anti-énumération des codes
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Avant : l'inscription indiquait « code déjà utilisé » (et même
-- s'il s'agissait d'un code admin), sans limite → on pouvait
-- tester des codes en masse puis se connecter avec.
-- Après : message générique identique (impossible de distinguer
-- profil / admin), et maximum 15 tentatives d'inscription par
-- quart d'heure et par adresse IP (profils ET agents AeroPrimes).
-- ============================================================

-- 1) Récupère l'IP du demandeur (en-têtes de la requête PostgREST)
create or replace function public.client_ip_()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h jsonb;
begin
  begin
    h := current_setting('request.headers', true)::jsonb;
  exception when others then
    return 'inconnu';
  end;

  if h is null then
    return 'inconnu';
  end if;

  return split_part(coalesce(h->>'x-forwarded-for', 'inconnu'), ',', 1);
end;
$$;

-- 2) Inscription profil : message générique + limite par IP
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
  v_ip text;
begin
  -- Nettoyage léger des vieilles tentatives
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

  -- Message GÉNÉRIQUE : on ne révèle ni l'existence du profil,
  -- ni le fait que le code soit un code administrateur.
  if exists (select 1 from public.profiles where code = c)
     or exists (select 1 from public.admins where crypt(c, code_hash) = code_hash) then
    return jsonb_build_object('error', 'code_indisponible');
  end if;

  insert into public.profiles (code, name, aircraft, data, statut, manager_id)
  values (c, trim(p_name), '', '{}'::jsonb, 'en_attente', p_manager_id);

  return jsonb_build_object('ok', true, 'statut', 'en_attente');
end;
$$;

-- 3) Inscription agent AeroPrimes : même limite par IP
drop function if exists public.signup_agent(text, text, text, uuid);

create or replace function public.signup_agent(
  p_identifiant text,
  p_nom text,
  p_mdp text,
  p_manager_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ident text;
  v_ip text;
begin
  delete from public.login_attempts where attempted_at < now() - interval '1 day';

  v_ip := public.client_ip_();
  if (
    select count(*) from public.login_attempts
    where purpose = 'signup_agent' and code = v_ip
      and attempted_at > now() - interval '15 minutes'
  ) >= 15 then
    return jsonb_build_object('error', 'trop_de_tentatives');
  end if;
  perform public.record_failed_attempt('signup_agent', v_ip);

  ident := trim(lower(p_identifiant));

  if length(ident) < 3 then
    return jsonb_build_object('error', 'identifiant_court');
  end if;

  if length(coalesce(p_mdp, '')) < 8 then
    return jsonb_build_object('error', 'mdp_court');
  end if;

  if p_manager_id is null
     or not exists (select 1 from public.admins where id = p_manager_id) then
    return jsonb_build_object('error', 'manager_requis');
  end if;

  if exists (select 1 from public.agents where lower(identifiant) = ident) then
    return jsonb_build_object('error', 'identifiant_utilise');
  end if;

  insert into public.agents (identifiant, nom, mdp_hash, manager_id)
  values (ident, trim(coalesce(p_nom, '')), crypt(p_mdp, gen_salt('bf')), p_manager_id);

  return jsonb_build_object('ok', true);
end;
$$;
