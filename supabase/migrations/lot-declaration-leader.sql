-- ============================================================
-- Déclaration de primes par un LEADER (bénéficiaires)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Le leader déclare, depuis Affectation, les agents bénéficiaires
-- de la prime toilettes (type, date, avion…) puis transmet au
-- manager choisi. La demande arrive dans la même table que les
-- déclarations agents : mail au manager + bulle sur Primes, et la
-- validation manager reste inchangée.
-- ============================================================

create or replace function public.leader_submit_prime(
  p_leader_code text,
  p_beneficiaire text,
  p_identifiant text,
  p_type text,
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
  -- Authentification par le code du profil (leader)
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

  if p_type not in ('V034', 'V035') then
    return jsonb_build_object('error', 'type_requis');
  end if;

  if length(coalesce(trim(p_avion), '')) = 0 then
    return jsonb_build_object('error', 'avion_requis');
  end if;

  if p_date is null then
    return jsonb_build_object('error', 'date_requise');
  end if;

  -- Manager destinataire : celui choisi, sinon celui du leader
  if p_manager_id is not null then
    if not exists (select 1 from public.admins where id = p_manager_id) then
      return jsonb_build_object('error', 'manager_inconnu');
    end if;
    v_manager := p_manager_id;
  elsif v_manager is null then
    return jsonb_build_object('error', 'manager_requis');
  end if;

  ident := lower(regexp_replace(trim(coalesce(p_identifiant, '')), '[^a-zA-Z0-9._-]+', '.', 'g'));
  ident := trim(both '.' from ident);
  if ident = '' then
    ident := lower(regexp_replace(trim(p_beneficiaire), '[^a-zA-Z0-9]+', '.', 'g'));
    ident := trim(both '.' from ident);
    if ident = '' then
      ident := 'beneficiaire';
    end if;
  end if;

  insert into public.declarations (
    agent_identifiant, agent_nom, avion, element,
    date_intervention, description, montant, statut, manager_id
  )
  values (
    ident,
    trim(p_beneficiaire),
    trim(p_avion),
    case when p_type = 'V034' then 'Toilette T1 (V034)' else 'Toilette T2 (V035)' end,
    p_date,
    coalesce(p_description, ''),
    null,
    'soumise',
    v_manager
  );

  return jsonb_build_object('ok', true);
end;
$$;
