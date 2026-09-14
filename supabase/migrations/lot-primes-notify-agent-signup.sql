-- ============================================================
-- AeroPrimes — email au manager lors d'une inscription agent
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- L'inscription reste immédiate (l'agent peut déclarer tout de
-- suite) ; son manager reçoit un email d'information. Le manager
-- peut ensuite désactiver le compte dans Primes → Comptes agents.
-- ============================================================

create or replace function public.notify_manager_new_agent()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  adm record;
  manager_email text;
  manager_name text;
  html text;
begin
  html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
    || '<h2 style="margin:0 0 10px">Nouvel agent inscrit sur AeroPrimes</h2>'
    || '<p style="margin:4px 0"><b>Agent :</b> ' || coalesce(new.nom, '') || ' (' || coalesce(new.identifiant, '') || ')</p>'
    || '<p style="margin:4px 0"><b>Le :</b> ' || to_char(now(), 'DD/MM/YYYY à HH24:MI') || '</p>'
    || '<p style="margin:4px 0">Il peut désormais déclarer ses primes. Vous pouvez désactiver son compte à tout moment depuis Primes &#8594; Comptes agents.</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>'
    || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
    || '<a href="https://aerosuites.github.io/aeroteam/#/primes" style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">Ouvrir AeroTeam &#8594; Primes</a>'
    || '</td></tr></table>'
    || '</div>';

  select a.email, a.name into manager_email, manager_name
  from public.admins a
  where a.id = new.manager_id;

  if manager_email is not null and length(trim(manager_email)) > 0 then
    perform public.send_manager_email_(
      p_to := manager_email,
      p_to_name := coalesce(manager_name, ''),
      p_subject := 'Nouvel agent inscrit — ' || coalesce(new.nom, new.identifiant),
      p_html := html
    );
  else
    for adm in (
      select email, name from public.admins
      where coalesce(trim(email), '') <> ''
    ) loop
      perform public.send_manager_email_(
        p_to := adm.email,
        p_to_name := coalesce(adm.name, ''),
        p_subject := 'Nouvel agent inscrit — ' || coalesce(new.nom, new.identifiant),
        p_html := html
      );
    end loop;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_manager_new_agent on public.agents;

create trigger trg_notify_manager_new_agent
after insert on public.agents
for each row
when (new.actif = true)
execute function public.notify_manager_new_agent();
