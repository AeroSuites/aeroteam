-- ============================================================
-- Notifications email — RÉACTIVATION via EmailJS + Gmail
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Remet en place l'envoi EmailJS (gratuit) AVEC l'interrupteur
-- de sécurité, puis active l'envoi. La clé privée EmailJS et les
-- identifiants se renseignent depuis AeroTeam → Primes →
-- Notifications email.
-- ============================================================

-- 1) Interrupteur de sécurité (idempotent)
alter table public.notify_config
  add column if not exists enabled boolean not null default false;

-- 2) Envoi via l'API EmailJS (gratuite, sans domaine)
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
  body jsonb;
begin
  select * into cfg from public.notify_config where id = 1;

  if cfg.enabled is distinct from true then
    return false;
  end if;

  if p_to is null or length(trim(p_to)) = 0 then
    return false;
  end if;

  if length(trim(coalesce(cfg.emailjs_service_id, ''))) = 0
     or length(trim(coalesce(cfg.emailjs_template_id, ''))) = 0
     or length(trim(coalesce(cfg.emailjs_public_key, ''))) = 0
     or length(trim(coalesce(cfg.emailjs_private_key, ''))) = 0 then
    return false;
  end if;

  body := jsonb_build_object(
    'service_id', cfg.emailjs_service_id,
    'template_id', cfg.emailjs_template_id,
    'user_id', cfg.emailjs_public_key,
    'accessToken', cfg.emailjs_private_key,
    'template_params', jsonb_build_object(
      'to_email', p_to,
      'to_name', coalesce(p_to_name, ''),
      'subject', p_subject,
      'message', p_html
    )
  );

  perform net.http_post(
    url := 'https://api.emailjs.com/api/v1.0/email/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := body,
    timeout_milliseconds := 5000
  );

  return true;
exception when others then
  return false;
end;
$$;

-- 3) RPC — lecture des infos de notification (jamais la clé privée)
create or replace function public.admin_get_notify_info(p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_email text;
  cfg record;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select email into v_email
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  select * into cfg from public.notify_config where id = 1;

  return jsonb_build_object(
    'ok', true,
    'email', coalesce(v_email, ''),
    'service_id', coalesce(cfg.emailjs_service_id, ''),
    'template_id', coalesce(cfg.emailjs_template_id, ''),
    'public_key', coalesce(cfg.emailjs_public_key, ''),
    'configured',
      (length(trim(coalesce(cfg.emailjs_service_id, ''))) > 0
       and length(trim(coalesce(cfg.emailjs_template_id, ''))) > 0
       and length(trim(coalesce(cfg.emailjs_public_key, ''))) > 0
       and length(trim(coalesce(cfg.emailjs_private_key, ''))) > 0)
  );
end;
$$;

-- 4) RPC — configuration de l'envoi (EmailJS)
drop function if exists public.admin_set_notify_config(text, text, text, text, text);
drop function if exists public.admin_set_notify_config(text, text, text, text);
drop function if exists public.admin_set_notify_config(text, text, text);

create or replace function public.admin_set_notify_config(
  p_admin_code text,
  p_service_id text,
  p_template_id text,
  p_public_key text,
  p_private_key text
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

  update public.notify_config
  set emailjs_service_id = case
        when coalesce(trim(p_service_id), '') <> '' then trim(p_service_id)
        else emailjs_service_id
      end,
      emailjs_template_id = case
        when coalesce(trim(p_template_id), '') <> '' then trim(p_template_id)
        else emailjs_template_id
      end,
      emailjs_public_key = case
        when coalesce(trim(p_public_key), '') <> '' then trim(p_public_key)
        else emailjs_public_key
      end,
      emailjs_private_key = case
        when coalesce(trim(p_private_key), '') <> '' then trim(p_private_key)
        else emailjs_private_key
      end
  where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

-- 5) ACTIVER l'envoi
update public.notify_config set enabled = true where id = 1;
