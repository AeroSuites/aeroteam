-- ============================================================
-- Correctif emails — bouton « Ouvrir AeroTeam » propre
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Le bouton était un simple lien avec padding : certaines
-- messageries l'affichaient décalé/chevaucheant sur 3 lignes.
-- Il devient un bouton tableau (rendu fiable partout).
-- ============================================================

-- 1) Email « nouvelle déclaration de prime »
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

-- 2) Email « nouvelle demande d'accès »
create or replace function public.notify_admin_new_registration()
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
    || '<h2 style="margin:0 0 10px">Nouvelle demande d''accès AeroTeam</h2>'
    || '<p style="margin:4px 0"><b>Profil demandé :</b> ' || coalesce(new.name, '') || '</p>'
    || '<p style="margin:4px 0"><b>Le :</b> ' || to_char(now(), 'DD/MM/YYYY à HH24:MI') || '</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>'
    || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
    || '<a href="https://aerosuites.github.io/aeroteam/#/admin" style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">Ouvrir AeroTeam &#8594; Administration</a>'
    || '</td></tr></table>'
    || '</div>';

  select a.email, a.name into manager_email, manager_name
  from public.admins a
  where a.id = new.manager_id;

  if manager_email is not null and length(trim(manager_email)) > 0 then
    perform public.send_manager_email_(
      p_to := manager_email,
      p_to_name := coalesce(manager_name, ''),
      p_subject := 'Nouvelle demande d''accès — ' || coalesce(new.name, ''),
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
        p_subject := 'Nouvelle demande d''accès — ' || coalesce(new.name, ''),
        p_html := html
      );
    end loop;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

-- 3) Email de test : montre le bouton corrigé
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
  html text;
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

  html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
    || '<h2 style="margin:0 0 10px">Test réussi</h2>'
    || '<p style="margin:4px 0">Vos notifications sont bien configurées. Voici un aperçu du bouton des emails :</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>'
    || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
    || '<a href="https://aerosuites.github.io/aeroteam/#/primes" style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">Ouvrir AeroTeam &#8594; Primes</a>'
    || '</td></tr></table>'
    || '</div>';

  sent := public.send_manager_email_(
    p_to := v_email,
    p_to_name := '',
    p_subject := 'Test — notifications AeroPrimes',
    p_html := html
  );

  if not sent then
    return jsonb_build_object('error', 'config_manquante');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
