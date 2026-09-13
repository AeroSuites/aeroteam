-- ============================================================
-- AeroPrimes — notifications email via SMTP2GO (gratuit)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Prérequis (gratuits) :
--   1. Compte sur https://app.smtp2go.com (1000 mails/mois offerts)
--   2. Senders → ajouter VOTRE adresse (ex. proton) → cliquer le
--      lien de vérification reçu dans cette boîte
--   3. Settings → API Keys → créer une clé (format api-xxxxx)
-- ============================================================

-- 1) Colonnes SMTP2GO dans la configuration
alter table public.notify_config
  add column if not exists smtp2go_api_key text not null default '';

alter table public.notify_config
  add column if not exists smtp2go_from text not null default '';

-- 2) Envoi d'un email via l'API SMTP2GO
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

  if p_to is null or length(trim(p_to)) = 0 then
    return false;
  end if;

  if length(trim(coalesce(cfg.smtp2go_api_key, ''))) = 0
     or length(trim(coalesce(cfg.smtp2go_from, ''))) = 0 then
    return false;
  end if;

  body := jsonb_build_object(
    'api_key', cfg.smtp2go_api_key,
    'sender', cfg.smtp2go_from,
    'to', jsonb_build_array(p_to),
    'subject', p_subject,
    'html_body', p_html
  );

  perform net.http_post(
    url := 'https://api.smtp2go.com/v3/email/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := body,
    timeout_milliseconds := 5000
  );

  return true;
exception when others then
  return false;
end;
$$;

-- 3) RPC — lecture des infos de notification (jamais la clé)
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
    'from_email', coalesce(cfg.smtp2go_from, ''),
    'configured',
      (length(trim(coalesce(cfg.smtp2go_api_key, ''))) > 0
       and length(trim(coalesce(cfg.smtp2go_from, ''))) > 0)
  );
end;
$$;

-- 4) RPC — configuration de l'envoi (SMTP2GO)
drop function if exists public.admin_set_notify_config(text, text, text, text, text);
drop function if exists public.admin_set_notify_config(text, text, text, text);

create or replace function public.admin_set_notify_config(
  p_admin_code text,
  p_api_key text,
  p_from text
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

  v_from := trim(coalesce(p_from, ''));
  if v_from <> '' and v_from !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'email_invalide');
  end if;

  update public.notify_config
  set smtp2go_api_key = case
        when coalesce(trim(p_api_key), '') <> '' then trim(p_api_key)
        else smtp2go_api_key
      end,
      smtp2go_from = case when v_from <> '' then v_from else smtp2go_from end
  where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;
