-- ============================================================
-- AeroPrimes — concordance automatique des identifiants
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Problème corrigé :
-- Un leader déclare une prime pour une personne SANS compte AeroPrimes.
-- La déclaration reçoit alors un identifiant « slug » fabriqué depuis le
-- nom (ex : « Jean Dupont » -> jean.dupont).
-- Quand la personne crée son compte et qu'on la rattache, seules les
-- déclarations DÉJÀ en base sont corrigées. Toute NOUVELLE déclaration
-- du leader repartait avec le slug -> invisible dans l'historique
-- AeroPrimes de la personne (et comptée « sans compte » côté manager).
--
-- Ce lot :
--   1) les déclarations leader utilisent l'identifiant du compte
--      AeroPrimes dès qu'il existe (alias, slug du nom, puis nom) ;
--   2) à la création d'un compte, ses déclarations orphelines sont
--      rattachées automatiquement par le nom (le bouton « Rattacher »
--      reste disponible pour les cas particuliers) ;
--   3) le rattachement manuel mémorise la correspondance nom -> compte
--      (table agent_aliases) : les déclarations futures du leader
--      retrouvent le compte même si le nom saisi diffère légèrement ;
--   4) rattrapage immédiat des déclarations orphelines existantes.
-- ============================================================

-- 0) Clé de comparaison des noms : minuscules, sans accents, mots triés.
--    « Jean DUPONT », « dupont jean » et « Jean  Dupont » donnent la même clé.
create or replace function public.norm_prime_nom(p_nom text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(tok, ' ' order by tok), '')
  from (
    select tok
    from regexp_split_to_table(
      regexp_replace(
        translate(
          lower(trim(coalesce(p_nom, ''))),
          'àâäãáéèêëíìîïóòôöõúùûüçñÿ',
          'aaaaaeeeeiiiiooooouuuucny'
        ),
        '[^a-z0-9]+', ' ', 'g'
      ),
      ' '
    ) as tok
  ) s
  where tok <> '';
$$;

-- 1) Correspondances nom -> compte mémorisées par les rattachements manuels
create table if not exists public.agent_aliases (
  nom_key text primary key,
  identifiant text not null,
  created_at timestamptz not null default now()
);

alter table public.agent_aliases enable row level security;

-- 2) Identifiant à stocker pour un bénéficiaire de prime
create or replace function public.resolve_prime_agent_identifiant(
  p_identifiant text,
  p_nom text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ident text;
  v_found text;
  v_n integer;
begin
  -- a) identifiant explicite : inchangé (slug du texte fourni)
  v_ident := lower(regexp_replace(trim(coalesce(p_identifiant, '')), '[^a-zA-Z0-9._-]+', '.', 'g'));
  v_ident := trim(both '.' from v_ident);
  if v_ident <> '' then
    return v_ident;
  end if;

  -- b) alias mémorisé par un rattachement manuel précédent
  if public.norm_prime_nom(p_nom) <> '' then
    select al.identifiant into v_found
    from public.agent_aliases al
    where al.nom_key = public.norm_prime_nom(p_nom);

    if v_found is not null
       and exists (select 1 from public.agents a where lower(a.identifiant) = lower(v_found)) then
      return v_found;
    end if;
  end if;

  -- c) slug du nom s'il correspond déjà à un compte AeroPrimes
  v_ident := lower(regexp_replace(trim(coalesce(p_nom, '')), '[^a-zA-Z0-9]+', '.', 'g'));
  v_ident := trim(both '.' from v_ident);
  if v_ident <> ''
     and exists (select 1 from public.agents a where lower(a.identifiant) = v_ident) then
    return v_ident;
  end if;

  -- d) un compte unique porte ce nom -> on prend son identifiant
  if public.norm_prime_nom(p_nom) <> '' then
    select count(*), min(a.identifiant) into v_n, v_found
    from public.agents a
    where public.norm_prime_nom(a.nom) = public.norm_prime_nom(p_nom);

    if v_n = 1 then
      return v_found;
    end if;
  end if;

  -- e) repli : slug du nom, comme avant
  if v_ident = '' then
    v_ident := 'beneficiaire';
  end if;
  return v_ident;
end;
$$;

-- 3) Déclaration unitaire (leader) : identifiant concordé
create or replace function public.leader_submit_prime(
  p_leader_code text,
  p_beneficiaire text,
  p_identifiant text,
  p_element text,
  p_trfx text,
  p_avion text,
  p_date date,
  p_description text,
  p_manager_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_leader_id uuid;
  v_manager uuid;
  ident text;
begin
  select id, manager_id into v_leader_id, v_manager
  from public.profiles
  where code = trim(coalesce(p_leader_code, ''))
    and statut = 'valide';

  if v_leader_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if length(coalesce(trim(p_beneficiaire), '')) = 0 then
    return jsonb_build_object('error', 'beneficiaire_requis');
  end if;

  if length(coalesce(trim(p_element), '')) = 0 then
    return jsonb_build_object('error', 'tache_requise');
  end if;

  if length(coalesce(trim(p_avion), '')) = 0 then
    return jsonb_build_object('error', 'avion_requis');
  end if;

  if p_date is null then
    return jsonb_build_object('error', 'date_requise');
  end if;

  if p_manager_id is not null then
    if not exists (select 1 from public.admins where id = p_manager_id) then
      return jsonb_build_object('error', 'manager_inconnu');
    end if;
    v_manager := p_manager_id;
  elsif v_manager is null then
    return jsonb_build_object('error', 'manager_requis');
  end if;

  ident := public.resolve_prime_agent_identifiant(p_identifiant, p_beneficiaire);

  insert into public.declarations (
    agent_identifiant, agent_nom, avion, element, trfx,
    date_intervention, description, montant, statut, manager_id
  )
  values (
    ident,
    trim(p_beneficiaire),
    trim(p_avion),
    trim(p_element),
    trim(coalesce(p_trfx, '')),
    p_date,
    coalesce(p_description, ''),
    null,
    'soumise',
    v_manager
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- 4) Déclarations groupées (leader) : identifiant concordé pour chaque ligne
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
  v_count integer;
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

  v_count := jsonb_array_length(p_items);

  -- L'email par ligne n'est neutralisé que si l'on groupe (2+)
  if v_count > 1 then
    perform set_config('app.skip_prime_email', 'on', true);
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    if length(coalesce(trim(item->>'beneficiaire'), '')) = 0 then
      if v_count > 1 then
        perform set_config('app.skip_prime_email', 'off', true);
      end if;
      return jsonb_build_object('error', 'beneficiaire_requis');
    end if;

    ident := public.resolve_prime_agent_identifiant(item->>'identifiant', item->>'beneficiaire');

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

  -- Un seul email, listant les bénéficiaires (uniquement pour 2+)
  if v_count > 1 then
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
  end if;

  return jsonb_build_object('ok', true, 'count', n);
exception when others then
  perform set_config('app.skip_prime_email', 'off', true);
  return jsonb_build_object('error', 'echec');
end;
$$;

-- 5) Rattachement manuel : mémorise aussi la correspondance nom -> compte
create or replace function public.admin_link_agent_declarations(
  p_admin_code text,
  p_nom text,
  p_identifiant text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  v_ident text;
  v_count bigint;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  -- Le compte AeroPrimes cible doit exister
  select identifiant into v_ident
  from public.agents
  where lower(identifiant) = lower(trim(p_identifiant))
  limit 1;
  if v_ident is null then
    return jsonb_build_object('error', 'agent_inconnu');
  end if;

  -- Déclarations du même nom qui ne sont rattachées à AUCUN compte existant
  -- (identifiant vide ou slug généré à partir du nom), dans le périmètre du manager
  update public.declarations d
  set agent_identifiant = v_ident
  where public.norm_prime_nom(d.agent_nom) = public.norm_prime_nom(p_nom)
    and public.norm_prime_nom(p_nom) <> ''
    and not exists (
      select 1
      from public.agents ag
      where lower(ag.identifiant) = lower(coalesce(d.agent_identifiant, ''))
    )
    and (
      d.manager_id is null
      or d.manager_id = v_admin_id
      or not exists (select 1 from public.admins a where a.id = d.manager_id)
    );
  get diagnostics v_count = row_count;

  -- Mémorise la correspondance pour les prochaines déclarations du leader
  if public.norm_prime_nom(p_nom) <> '' then
    insert into public.agent_aliases (nom_key, identifiant)
    values (public.norm_prime_nom(p_nom), v_ident)
    on conflict (nom_key) do update set identifiant = excluded.identifiant;
  end if;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'identifiant', v_ident
  );
end;
$$;

-- 6) À la création d'un compte agent, rattacher automatiquement ses
--    déclarations orphelines portant le même nom
create or replace function public.link_declarations_on_agent_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.norm_prime_nom(new.nom) = '' then
    return new;
  end if;

  update public.declarations d
  set agent_identifiant = new.identifiant
  where public.norm_prime_nom(d.agent_nom) = public.norm_prime_nom(new.nom)
    and not exists (
      select 1
      from public.agents a
      where lower(a.identifiant) = lower(coalesce(d.agent_identifiant, ''))
    );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_link_declarations_on_agent_signup on public.agents;

create trigger trg_link_declarations_on_agent_signup
after insert on public.agents
for each row
execute function public.link_declarations_on_agent_signup();

-- 7) Rattrapage : les déclarations orphelines existantes sont rattachées
--    au compte unique portant le même nom (répare l'historique déjà en base)
update public.declarations d
set agent_identifiant = a.identifiant
from public.agents a
where public.norm_prime_nom(d.agent_nom) <> ''
  and public.norm_prime_nom(a.nom) = public.norm_prime_nom(d.agent_nom)
  and not exists (
    select 1
    from public.agents x
    where lower(x.identifiant) = lower(coalesce(d.agent_identifiant, ''))
  )
  and (
    select count(*)
    from public.agents a2
    where public.norm_prime_nom(a2.nom) = public.norm_prime_nom(d.agent_nom)
  ) = 1;
