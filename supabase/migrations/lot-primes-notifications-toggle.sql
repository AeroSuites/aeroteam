-- ============================================================
-- Notifications email — interrupteur OFF
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- L'envoi est conservé dans le code mais désactivé : tant que
-- notify_config.enabled = false, aucune demande HTTP n'est faite
-- (déclarations et inscriptions restent 100 % fonctionnelles).
-- Pour réactiver plus tard :
--   update public.notify_config set enabled = true where id = 1;
-- ============================================================

alter table public.notify_config
  add column if not exists enabled boolean not null default false;

-- send_manager_email_ : vérifie l'interrupteur avant tout envoi
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
