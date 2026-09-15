-- ============================================================
-- Correctif : fonction client_ip_ (limitation anti-abus)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- C'est la seule fonction qui manquait : sans elle, l'inscription
-- échouait avec « function public.client_ip_() does not exist ».
-- ============================================================

create or replace function public.client_ip_()
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  h text;
  v text;
begin
  h := current_setting('request.headers', true);
  if h is null or h = '' then
    return 'inconnu';
  end if;

  begin
    v := h::jsonb->>'x-forwarded-for';
  exception when others then
    v := null;
  end;

  if v is null or v = '' then
    return 'inconnu';
  end if;

  return trim(split_part(v, ',', 1));
end;
$fn$;
