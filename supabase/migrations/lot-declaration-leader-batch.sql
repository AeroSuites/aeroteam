-- ============================================================
-- Déclaration leader — envoi groupé (UN SEUL email)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Avant : 1 déclaration = 1 email. Maintenant la transmission
-- depuis Affectation envoie UN email listant tous les
-- bénéficiaires. La validation manager ne change pas.
-- ============================================================

-- 1) L'email par ligne devient muet quand un envoi groupé est en cours
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
  if current_setting('app.skip_prime_email', true) = 'on' then
    return new;
  end if;

  select a.email, a.name into manager_email, manager_name
  from public.admins a
  where a.id = new.manager_id;

  html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
    || '<h2 style="margin:0 0 10px">Nouvelle déclaration de prime à valider</h2>'
    || '<p style="margin:4px 0"><b>Agent :</b> ' || coalesce(new.agent_nom, '') || ' (' || coalesce(new.agent_identifiant, '') || ')</p>'
    || '<p style="margin:4px 0"><b>Avion :</b> ' || coalesce(new.avion, '—') || '</p>'
    || '<p style="margin:4px 0"><b>Élément :</b> ' || coalesce(new.element, '—') || '</p>'
    || '<p style="margin:4px 0"><b>TRFX :</b> ' || coalesce(new.trfx, '—') || '</p>'
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

-- 2) Transmission groupée par le leader : N déclarations, 1 email
create or replace function public.leader_submit_primes(
  p_leader_code text,
  p_manager_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_leader_id uuid;
  v_manager uuid;
  v_manager_email text;
  v_manager_name text;
  item jsonb;
  n integer := 0;
  ident text;
  html text;
  list_html text := '';
  ref_avion text := '';
begin
  select id, manager_id into v_leader_id, v_manager
  from public.profiles
  where code = trim(coalesce(p_leader_code, ''))
    and statut = 'valide';

  if v_leader_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'aucune_ligne');
  end if;

  if p_manager_id is not null then
    if not exists (select 1 from public.admins where id = p_manager_id) then
      return jsonb_build_object('error', 'manager_inconnu');
    end if;
    v_manager := p_manager_id;
  elsif v_manager is null then
    return jsonb_build_object('error', 'manager_requis');
  end if;

  -- Les emails par ligne sont neutralisés : un seul email partira
  perform set_config('app.skip_prime_email', 'on', true);

  for item in select * from jsonb_array_elements(p_items) loop
    if length(coalesce(trim(item->>'beneficiaire'), '')) = 0 then
      perform set_config('app.skip_prime_email', 'off', true);
      return jsonb_build_object('error', 'beneficiaire_requis');
    end if;

    ident := lower(regexp_replace(trim(coalesce(item->>'identifiant', '')), '[^a-zA-Z0-9._-]+', '.', 'g'));
    ident := trim(both '.' from ident);
    if ident = '' then
      ident := lower(regexp_replace(trim(item->>'beneficiaire'), '[^a-zA-Z0-9]+', '.', 'g'));
      ident := trim(both '.' from ident);
      if ident = '' then
        ident := 'beneficiaire';
      end if;
    end if;

    insert into public.declarations (
      agent_identifiant, agent_nom, avion, element, trfx,
      date_intervention, description, montant, statut, manager_id
    )
    values (
      ident,
      trim(item->>'beneficiaire'),
      trim(coalesce(item->>'avion', '')),
      trim(coalesce(item->>'element', '')),
      trim(coalesce(item->>'trfx', '')),
      nullif(trim(coalesce(item->>'date', '')), '')::date,
      coalesce(item->>'description', ''),
      null,
      'soumise',
      v_manager
    );

    n := n + 1;
    if ref_avion = '' and coalesce(trim(item->>'avion'), '') <> '' then
      ref_avion := trim(item->>'avion');
    end if;

    list_html := list_html
      || '<tr>'
      || '<td style="padding:4px 12px 4px 0;font-weight:bold">' || coalesce(item->>'beneficiaire', '') || '</td>'
      || '<td style="padding:4px 12px 4px 0">' || coalesce(item->>'avion', '') || '</td>'
      || '<td style="padding:4px 12px 4px 0">' || coalesce(item->>'element', '') || '</td>'
      || '<td style="padding:4px 12px 4px 0;font-family:monospace">' || coalesce(item->>'trfx', '') || '</td>'
      || '<td style="padding:4px 0">' || coalesce(item->>'date', '') || '</td>'
      || '</tr>';
  end loop;

  perform set_config('app.skip_prime_email', 'off', true);

  select a.email, a.name into v_manager_email, v_manager_name
  from public.admins a
  where a.id = v_manager;

  if v_manager_email is not null and length(trim(v_manager_email)) > 0 then
    html :=
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
      || '<h2 style="margin:0 0 10px">Nouvelles déclarations de primes (' || n || ')</h2>'
      || '<p style="margin:4px 0 10px">Un leader vous transmet les bénéficiaires suivants à valider :</p>'
      || '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">'
      || '<tr style="text-align:left"><th style="padding:2px 12px 6px 0">Bénéficiaire</th><th style="padding:2px 12px 6px 0">Avion</th><th style="padding:2px 12px 6px 0">Tâche</th><th style="padding:2px 12px 6px 0">TRFX</th><th style="padding:2px 0 6px 0">Date</th></tr>'
      || list_html
      || '</table>'
      || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>'
      || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
      || '<a href="https://aerosuites.github.io/aeroteam/#/primes" style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">Ouvrir AeroTeam &#8594; Primes</a>'
      || '</td></tr></table>'
      || '</div>';

    perform public.send_manager_email_(
      p_to := v_manager_email,
      p_to_name := coalesce(v_manager_name, ''),
      p_subject := 'Nouvelles déclarations de primes (' || n || ')' ||
        case when ref_avion <> '' then ' — ' || ref_avion else '' end,
      p_html := html
    );
  end if;

  return jsonb_build_object('ok', true, 'count', n);
exception when others then
  perform set_config('app.skip_prime_email', 'off', true);
  return jsonb_build_object('error', 'echec');
end;
$$;
