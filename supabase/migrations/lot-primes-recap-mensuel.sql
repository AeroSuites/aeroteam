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
  v_t1 integer := 0;
  v_t2 integer := 0;
  v_validees integer := 0;
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
    || '<p style="margin:0 0 14px;color:#64748b;font-size:12px">'
    || 'Primes DÉCLARÉES par personne et par type (T1 = V034, T2 = V035) et total des validées.</p>';

  -- Tableau récapitulatif : 1 ligne par agent
  v_html := v_html
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
    || 'style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 12px">'
    || '<tr style="background:#002157;color:#ffffff;text-align:left">'
    || '<th style="padding:8px 10px;border:1px solid #002157">Agent</th>'
    || '<th style="padding:8px 10px;border:1px solid #002157;text-align:center">T1</th>'
    || '<th style="padding:8px 10px;border:1px solid #002157;text-align:center">T2</th>'
    || '<th style="padding:8px 10px;border:1px solid #002157;text-align:center">Total</th>'
    || '<th style="padding:8px 10px;border:1px solid #002157;text-align:center">Validées</th>'
    || '</tr>';

  for rec in
    select coalesce(nullif(trim(d.agent_nom), ''), d.agent_identifiant, 'Agent inconnu') as nom,
           count(*) as total,
           count(*) filter (where d.statut = 'validee') as validees,
           count(*) filter (where d.statut = 'refusee') as refusees,
           count(*) filter (where coalesce(d.statut, '') not in ('validee', 'refusee')) as attente,
           count(*) filter (where d.categorie = 'V034') as t1,
           count(*) filter (where d.categorie = 'V035') as t2
    from public.declarations d
    where coalesce(d.manager_hidden, false) = false
      -- Même logique que l'appli : mois de la DATE D'INTERVENTION (sinon date d'envoi)
      and coalesce(d.date_intervention, (d.created_at at time zone 'Europe/Paris')::date) >= v_start
      and coalesce(d.date_intervention, (d.created_at at time zone 'Europe/Paris')::date) < v_end
    group by 1
    order by 1
  loop
    v_agents := v_agents + 1;
    v_total := v_total + rec.total;
    v_t1 := v_t1 + rec.t1;
    v_t2 := v_t2 + rec.t2;
    v_validees := v_validees + rec.validees;

    v_html := v_html
      || '<tr>'
      || '<td style="padding:6px 10px;border:1px solid #e2e8f0">'
      || replace(rec.nom, '<', '&lt;') || '</td>'
      || '<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">'
      || rec.t1 || '</td>'
      || '<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">'
      || rec.t2 || '</td>'
      || '<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:bold">'
      || rec.total || '</td>'
      || '<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">'
      || rec.validees || '</td>'
      || '</tr>';
  end loop;

  if v_agents = 0 then
    v_html := v_html
      || '<tr><td colspan="5" style="padding:10px;border:1px solid #e2e8f0;color:#64748b">'
      || 'Aucune déclaration sur ce mois.</td></tr>';
  end if;

  if v_agents > 0 then
    v_html := v_html
      || '<tr style="background:#f1f5f9;font-weight:bold">'
      || '<td style="padding:8px 10px;border:1px solid #e2e8f0">Total</td>'
      || '<td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">' || v_t1 || '</td>'
      || '<td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">' || v_t2 || '</td>'
      || '<td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">' || v_total || '</td>'
      || '<td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">' || v_validees || '</td>'
      || '</tr>';
  end if;

  v_html := v_html || '</table>';

  if v_agents > 0 then
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
