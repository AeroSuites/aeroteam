-- ============================================================
-- Déclaration de primes par un LEADER — v2
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Le leader déclare : bénéficiaire(s) + la TÂCHE effectuée
-- (bloc / sous-bloc / ligne importée de Victory). Le TYPE de
-- prime (V034/V035) reste choisi par le manager à la validation.
-- ============================================================

drop function if exists public.leader_submit_prime(text, text, text, text, text, date, text, uuid);

create or replace function public.leader_submit_prime(
  p_leader_code text,
  p_beneficiaire text,
  p_identifiant text,
  p_element text,
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

  if length(coalesce(trim(p_element), '')) = 0 then
    return jsonb_build_object('error', 'tache_requise');
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
    trim(p_element),
    p_date,
    coalesce(p_description, ''),
    null,
    'soumise',
    v_manager
  );

  return jsonb_build_object('ok', true);
end;
$$;
