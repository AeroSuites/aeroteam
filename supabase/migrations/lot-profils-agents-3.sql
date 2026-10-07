-- ============================================================
-- Garde-fou : un client ancien (qui ne connaît pas « charge » /
-- « chargeHistory ») ne doit pas écraser la charge ni son historique
-- côté serveur lors d'une sauvegarde.
-- Si la clé est absente du payload, la valeur existante est conservée.
-- À exécuter dans Supabase (SQL Editor).
-- ============================================================

create or replace function public.save_profile_data(
  p_code text,
  p_data jsonb,
  p_rev bigint default 0,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  current_rev bigint;
  current_data jsonb;
begin
  select rev, data
  into current_rev, current_data
  from public.profiles
  where code = p_code;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if not p_force and current_rev <> coalesce(p_rev, 0) then
    return jsonb_build_object(
      'error', 'conflict',
      'rev', current_rev,
      'updated_at', (select updated_at from public.profiles where code = p_code)
    );
  end if;

  update public.profiles
  set data = coalesce(p_data, '{}'::jsonb)
             || case
                  when p_data ? 'charge' then '{}'::jsonb
                  when current_data ? 'charge'
                    then jsonb_build_object('charge', current_data->'charge')
                  else '{}'::jsonb
                end
             || case
                  when p_data ? 'chargeHistory' then '{}'::jsonb
                  when current_data ? 'chargeHistory'
                    then jsonb_build_object('chargeHistory', current_data->'chargeHistory')
                  else '{}'::jsonb
                end,
      rev = rev + 1,
      updated_at = now()
  where code = p_code;

  select to_jsonb(t)
  into result
  from (
    select id::text as id, name, aircraft, rev, updated_at
    from public.profiles
    where code = p_code
  ) t;

  return coalesce(result, jsonb_build_object('error', 'not_found'));
end;
$$;

grant execute on function public.save_profile_data(text, jsonb, bigint, boolean) to anon, authenticated;

-- Le suivi des agents renvoie aussi leur historique de charges
-- (consultation des archives côté leader).
create or replace function public.leader_get_agents_progress(p_leader_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader_id uuid;
  list jsonb;
begin
  select id into v_leader_id
  from public.profiles
  where code = trim(p_leader_code) and statut = 'valide';

  if v_leader_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb)
  into list
  from (
    select
      p.id::text as id,
      p.name,
      p.updated_at,
      p.data->'charge'->>'date' as date,
      p.data->'charge'->>'aircraft' as aircraft,
      p.data->'charge'->>'teamName' as "teamName",
      p.data->'charge'->>'sentAt' as "sentAt",
      coalesce(p.data->'charge'->'tasks', '[]'::jsonb) as tasks,
      coalesce(p.data->'chargeHistory', '[]'::jsonb) as "chargeHistory"
    from public.profiles p
    where p.type = 'agent'
      and p.statut = 'valide'
      and (
        p.data->'charge'->>'leaderId' = v_leader_id::text
        or exists (
          select 1
          from jsonb_array_elements(coalesce(p.data->'chargeHistory', '[]'::jsonb)) as h
          where h->>'leaderId' = v_leader_id::text
        )
      )
  ) t;

  return jsonb_build_object('ok', true, 'agents', list);
end;
$$;

grant execute on function public.leader_get_agents_progress(text) to anon, authenticated;
