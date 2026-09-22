-- ============================================================
-- AeroPrimes — RÉCAP MENSUEL par email (texte, sans fichier joint)
-- Le 1er de chaque mois : un email récapitulatif part à l'adresse
-- manager, avec le récap écrit par agent (1 bloc par agent).
-- Remplace le mail immédiat « nouvelle déclaration ».
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Prérequis : la configuration d'envoi EmailJS (page Primes) et
-- l'adresse email manager (page Primes → « Mon adresse email »).
-- Si l'activation de pg_cron échoue, passer par le tableau de bord
-- Supabase : Database > Extensions > activer « pg_cron », puis
-- relancer la dernière commande (cron.schedule) de ce fichier.
--
-- Pour revenir en arrière (réactiver le mail immédiat) :
--   create trigger trg_notify_manager_new_prime
--     after insert on public.declarations
--     for each row execute function public.notify_manager_new_prime();
-- ============================================================

-- 0) Le mail immédiat est remplacé par le récap mensuel
drop trigger if exists trg_notify_manager_new_prime on public.declarations;

-- 0 bis) Sécurité : colonnes utilisées par le récap (déjà créées normalement)
alter table public.declarations
  add column if not exists trfx text not null default '';
alter table public.declarations
  add column if not exists manager_hidden boolean not null default false;

-- 1) Tâches planifiées (1er du mois)
create extension if not exists pg_cron;

-- 2) Envoi du récap d'un mois donné (null = mois précédent, heure de Paris)
create or replace function public.send_primes_monthly_recap(p_month text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_month text;
  v_start date;
  v_end date;
  v_label text;
  v_recipients text[];
  v_html text;
  v_agents integer := 0;
  v_total integer := 0;
  rec record;
  line record;
begin
  -- Mois cible : « AAAA-MM » (par défaut : le mois qui vient de s'achever)
  if coalesce(trim(p_month), '') <> '' then
    v_month := trim(p_month);
  else
    v_month := to_char((now() at time zone 'Europe/Paris') - interval '1 month', 'YYYY-MM');
  end if;

  v_start := (v_month || '-01')::date;
  v_end := (v_start + interval '1 month')::date;
  v_label := to_char(v_start, 'TMMonth YYYY');
  v_label := upper(substr(v_label, 1, 1)) || substr(v_label, 2);

  -- Destinataires : adresses email des administrateurs (adresse manager)
  select array_agg(distinct trim(a.email))
    into v_recipients
  from public.admins a
  where length(trim(coalesce(a.email, ''))) > 0;

  if v_recipients is null or array_length(v_recipients, 1) = 0 then
    return jsonb_build_object('ok', false, 'error', 'aucun_destinataire');
  end if;

  v_html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">'
    || '<h2 style="margin:0 0 4px">Récap mensuel des primes toilettes — ' || v_label || '</h2>'
    || '<p style="margin:0 0 14px;color:#64748b;font-size:12px">Récapitulatif par agent des déclarations du mois.</p>';

  for rec in
    select coalesce(nullif(trim(d.agent_nom), ''), d.agent_identifiant, 'Agent inconnu') as nom,
           count(*) as total,
           count(*) filter (where d.statut = 'validee') as validees,
           count(*) filter (where d.statut = 'refusee') as refusees,
           count(*) filter (where coalesce(d.statut, '') not in ('validee', 'refusee')) as attente
    from public.declarations d
    where coalesce(d.manager_hidden, false) = false
      and d.created_at >= v_start
      and d.created_at < v_end
    group by 1
    order by 1
  loop
    v_agents := v_agents + 1;
    v_total := v_total + rec.total;

    v_html := v_html
      || '<div style="margin:0 0 16px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px">'
      || '<p style="margin:0 0 6px;font-weight:bold">'
      || replace(rec.nom, '<', '&lt;') || ' — ' || rec.total || ' déclaration(s)</p>'
      || '<p style="margin:0 0 8px;font-size:12px;color:#475569">'
      || rec.validees || ' validée(s) · ' || rec.refusees || ' refusée(s) · '
      || rec.attente || ' en attente</p>'
      || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
      || 'style="width:100%;border-collapse:collapse;font-size:12px">'
      || '<tr style="text-align:left;color:#64748b">'
      || '<th style="padding:2px 10px 4px 0">Date</th>'
      || '<th style="padding:2px 10px 4px 0">Élément</th>'
      || '<th style="padding:2px 10px 4px 0">TRFX</th>'
      || '<th style="padding:2px 10px 4px 0">Avion</th>'
      || '<th style="padding:2px 10px 4px 0">Statut</th></tr>';

    for line in
      select d.date_intervention, d.element, d.trfx, d.avion, d.statut
      from public.declarations d
      where coalesce(d.manager_hidden, false) = false
        and d.created_at >= v_start
        and d.created_at < v_end
        and coalesce(nullif(trim(d.agent_nom), ''), d.agent_identifiant, 'Agent inconnu') = rec.nom
      order by d.date_intervention nulls last, d.created_at
    loop
      v_html := v_html
        || '<tr>'
        || '<td style="padding:2px 10px 2px 0">'
        || coalesce(to_char(line.date_intervention, 'DD/MM'), '—') || '</td>'
        || '<td style="padding:2px 10px 2px 0">' || replace(coalesce(line.element, '—'), '<', '&lt;') || '</td>'
        || '<td style="padding:2px 10px 2px 0;font-family:monospace">'
        || replace(coalesce(nullif(trim(line.trfx), ''), '—'), '<', '&lt;') || '</td>'
        || '<td style="padding:2px 10px 2px 0">' || replace(coalesce(line.avion, '—'), '<', '&lt;') || '</td>'
        || '<td style="padding:2px 10px 2px 0">'
        || case line.statut
             when 'validee' then 'Validée'
             when 'refusee' then 'Refusée'
             else 'En attente'
           end
        || '</td></tr>';
    end loop;

    v_html := v_html || '</table></div>';
  end loop;

  if v_agents = 0 then
    v_html := v_html || '<p style="margin:0 0 14px">Aucune déclaration sur ce mois.</p>';
  else
    v_html := v_html
      || '<p style="margin:0 0 14px;font-weight:bold">Total du mois : '
      || v_total || ' déclaration(s), ' || v_agents || ' agent(s).</p>';
  end if;

  v_html := v_html
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr>'
    || '<td style="background:#0284c7;border-radius:6px;text-align:center">'
    || '<a href="https://aerosuites.github.io/aeroteam/#/primes" '
    || 'style="display:inline-block;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;'
    || 'font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap">'
    || 'Ouvrir AeroTeam &#8594; Primes</a>'
    || '</td></tr></table></div>';

  -- Envoi à chaque destinataire (adresse manager)
  for rec in select unnest(v_recipients) as email loop
    perform public.send_manager_email_(
      p_to := rec.email,
      p_to_name := '',
      p_subject := 'Récap mensuel des primes toilettes — ' || v_label,
      p_html := v_html
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'month', v_month,
    'label', v_label,
    'agents', v_agents,
    'total', v_total,
    'recipients', array_length(v_recipients, 1)
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

-- 3) RPC — envoi manuel (test) depuis la page Primes
create or replace function public.admin_send_primes_recap_now(
  p_admin_code text,
  p_month text default null
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

  return public.send_primes_monthly_recap(p_month);
end;
$$;

-- 4) Planification : le 1er de chaque mois à 06:00 UTC (~08:00 Paris)
select cron.schedule(
  'primes-recap-mensuel',
  '0 6 1 * *',
  $$select public.send_primes_monthly_recap();$$
);
