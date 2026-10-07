-- ============================================================
-- Correctif profils agents :
-- 1) get_profile (identifiant + code) doit renvoyer le rôle « type ».
--    L'ancienne version 2 arguments, encore active, ne le renvoyait pas :
--    l'application voyait tous les profils comme « leader » (pas de page
--    « Ma charge », rôle non appliqué).
-- 2) leader_clear_charge : retirer la charge d'un agent (elle part dans
--    l'historique) — utilisable depuis le tableau de bord du leader.
-- À exécuter dans Supabase (SQL Editor).
-- ============================================================

drop function if exists public.get_profile(text, text);

create or replace function public.get_profile(
  p_identifiant text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  st text;
begin
  if public.too_many_attempts('profile', p_code) then
    return jsonb_build_object('error', 'locked');
  end if;

  select to_jsonb(t), t.statut into result, st
  from (
    select id::text as id, identifiant, name, aircraft, rev, updated_at, data, statut, type
    from public.profiles
    where lower(identifiant) = lower(trim(coalesce(p_identifiant, '')))
      and code = p_code
  ) t;

  if result is not null and st = 'en_attente' then
    return jsonb_build_object('error', 'pending');
  end if;

  if result is not null then
    perform public.clear_attempts('profile', p_code);
    return result;
  end if;

  perform public.record_failed_attempt('profile', p_code);
  return jsonb_build_object('error', 'not_found');
end;
$$;

grant execute on function public.get_profile(text, text) to anon, authenticated;

-- Ancienne variante à un seul argument : inutile, on la retire
drop function if exists public.get_profile(text);

-- Retirer la charge d'un agent (l'agent ne la voit plus ; historique conservé)
create or replace function public.leader_clear_charge(
  p_leader_code text,
  p_agent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader_id uuid;
  v_agent public.profiles%rowtype;
  v_history jsonb;
begin
  select id into v_leader_id
  from public.profiles
  where code = trim(p_leader_code) and statut = 'valide';

  if v_leader_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_agent from public.profiles where id = p_agent_id;

  if not found then
    return jsonb_build_object('error', 'agent_introuvable');
  end if;

  if coalesce(v_agent.data->'charge'->>'leaderId', '') <> v_leader_id::text then
    return jsonb_build_object('error', 'pas_votre_charge');
  end if;

  v_history := jsonb_build_array(v_agent.data->'charge')
               || coalesce(v_agent.data->'chargeHistory', '[]'::jsonb);

  if jsonb_array_length(v_history) > 10 then
    v_history := (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from (
        select e
        from jsonb_array_elements(v_history) with ordinality as t(e, ord)
        where ord <= 10
      ) s
    );
  end if;

  update public.profiles
  set data = (coalesce(data, '{}'::jsonb) - 'charge')
             || jsonb_build_object('chargeHistory', v_history),
      rev = rev + 1,
      updated_at = now()
  where id = v_agent.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leader_clear_charge(text, uuid) to anon, authenticated;
