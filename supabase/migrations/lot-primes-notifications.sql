-- ============================================================
-- AeroPrimes — notifications email au manager (via Brevo)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- - chaque administrateur AeroTeam peut enregistrer son adresse
--   email de notification depuis la page Primes
-- - à chaque déclaration soumise, un email est envoyé au manager
--   de l'agent (via l'API Brevo, depuis l'adresse dédiée)
-- - l'envoi ne bloque JAMAIS la déclaration, même en cas d'erreur
-- ============================================================

-- 1) Email de notification par administrateur
alter table public.admins
  add column if not exists email text not null default '';

-- 2) Configuration d'envoi (remplie depuis la page Primes)
create table if not exists public.notify_config (
  id integer primary key default 1 check (id = 1),
  brevo_api_key text not null default '',
  from_email text not null default '',
  from_name text not null default 'AeroSuite'
);

insert into public.notify_config (id) values (1) on conflict (id) do nothing;

alter table public.notify_config enable row level security;

-- 3) Extension réseau (appels HTTP depuis la base)
create extension if not exists pg_net with schema extensions;

-- 4) Envoi d'un email (helper réutilisé par le trigger et le test)
create or replace function public.send_manager_email_(
  p_to text,
  p_to_name text,
  p_subject text,
  p_html text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
begin
  select * into cfg from public.notify_config where id = 1;

  if p_to is null or length(trim(p_to)) = 0 then
    return false;
  end if;

  if cfg.from_email is null or length(trim(cfg.from_email)) = 0
     or cfg.brevo_api_key is null or length(trim(cfg.brevo_api_key)) = 0 then
    return false;
  end if;

  perform net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object(
      'api-key', cfg.brevo_api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'sender', jsonb_build_object('email', cfg.from_email, 'name', cfg.from_name),
      'to', jsonb_build_array(jsonb_build_object('email', p_to, 'name', coalesce(p_to_name, ''))),
      'subject', p_subject,
      'htmlContent', p_html
    ),
    timeout_milliseconds := 5000
  );

  return true;
exception when others then
  return false;
end;
$$;

-- 5) Déclencheur : nouvelle déclaration -> email au manager
create or replace function public.notify_manager_new_prime()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  manager_email text;
  manager_name text;
  html text;
begin
  select a.email, a.name into manager_email, manager_name
  from public.admins a
  where a.id = new.manager_id;

  html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
    || '<h2 style="margin:0 0 10px">Nouvelle déclaration de prime à valider</h2>'
    || '<p style="margin:4px 0"><b>Agent :</b> ' || coalesce(new.agent_nom, '') || ' (' || coalesce(new.agent_identifiant, '') || ')</p>'
    || '<p style="margin:4px 0"><b>Avion :</b> ' || coalesce(new.avion, '—') || '</p>'
    || '<p style="margin:4px 0"><b>Élément :</b> ' || coalesce(new.element, '—') || '</p>'
    || '<p style="margin:4px 0"><b>Date de l''intervention :</b> ' || coalesce(new.date_intervention::text, '—') || '</p>'
    || '<p style="margin:4px 0"><b>Description :</b><br>' || replace(coalesce(new.description, ''), E'\n', '<br>') || '</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>'
    || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
    || '<a href="https://aerosuites.github.io/aeroteam/#/primes" style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">Ouvrir AeroTeam &#8594; Primes</a>'
    || '</td></tr></table>'
    || '</div>';

  perform public.send_manager_email_(
    p_to := manager_email,
    p_to_name := coalesce(manager_name, ''),
    p_subject := 'Nouvelle déclaration de prime — ' || coalesce(new.avion, ''),
    p_html := html
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_manager_new_prime on public.declarations;

create trigger trg_notify_manager_new_prime
after insert on public.declarations
for each row
when (new.statut = 'soumise')
execute function public.notify_manager_new_prime();

-- 6) RPC — lecture des infos de notification (sans la clé API)
create or replace function public.admin_get_notify_info(p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  v_email text;
  cfg record;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id, email into v_admin_id, v_email
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  select * into cfg from public.notify_config where id = 1;

  return jsonb_build_object(
    'ok', true,
    'email', coalesce(v_email, ''),
    'from_email', coalesce(cfg.from_email, ''),
    'from_name', coalesce(cfg.from_name, ''),
    'configured', (length(trim(coalesce(cfg.brevo_api_key, ''))) > 0 and length(trim(coalesce(cfg.from_email, ''))) > 0)
  );
end;
$$;

-- 7) RPC — enregistrer SA propre adresse de notification
create or replace function public.admin_set_my_email(
  p_admin_code text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  v_email text;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  v_email := trim(lower(coalesce(p_email, '')));
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'email_invalide');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  if v_admin_id is null then
    return jsonb_build_object('error', 'not_admin');
  end if;

  update public.admins set email = v_email where id = v_admin_id;
  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

-- 8) RPC — configuration de l'envoi (clé Brevo + expéditeur dédié)
create or replace function public.admin_set_notify_config(
  p_admin_code text,
  p_brevo_api_key text,
  p_from_email text,
  p_from_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_from text;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  v_from := trim(lower(coalesce(p_from_email, '')));
  if v_from <> '' and v_from !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'email_invalide');
  end if;

  update public.notify_config
  set brevo_api_key = case
        when coalesce(trim(p_brevo_api_key), '') <> '' then trim(p_brevo_api_key)
        else brevo_api_key
      end,
      from_email = case when v_from <> '' then v_from else from_email end,
      from_name = case
        when coalesce(trim(p_from_name), '') <> '' then trim(p_from_name)
        else from_name
      end
  where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

-- 9) RPC — email de test vers sa propre adresse
create or replace function public.admin_test_email(p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_email text;
  sent boolean;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select email into v_email
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  if v_email is null or length(trim(v_email)) = 0 then
    return jsonb_build_object('error', 'email_requis');
  end if;

  sent := public.send_manager_email_(
    p_to := v_email,
    p_to_name := '',
    p_subject := 'Test — notifications AeroPrimes',
    p_html := '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5"><h2 style="margin:0 0 10px">Test réussi</h2><p style="margin:4px 0">Vos notifications des déclarations de primes sont bien configurées.</p></div>'
  );

  if not sent then
    return jsonb_build_object('error', 'config_manquante');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
