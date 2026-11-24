-- 12) Partage des statuts entre agents d'un même binôme (même charge)
-- Quand un agent change le statut d'une ligne, les autres agents qui ont reçu
-- la même charge (même leader, même date, même avion, même équipe) voient la
-- ligne mise à jour. Le leader, lui, consolide les rapports avec priorité au
-- COMPLETE (côté application).

create or replace function public.agent_share_charge_status(
  p_agent_code text,
  p_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent public.profiles%rowtype;
  v_charge jsonb;
  v_peer record;
  v_map jsonb := '{}'::jsonb;
  v_task jsonb;
  v_key text;
  v_status text;
  v_peer_tasks jsonb;
  v_new_tasks jsonb;
  v_updated int := 0;
begin
  select * into v_agent
  from public.profiles
  where code = trim(coalesce(p_agent_code, '')) and statut = 'valide';

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_charge := v_agent.data->'charge';
  if v_charge is null or jsonb_typeof(v_charge) <> 'object' then
    return jsonb_build_object('error', 'charge_vide');
  end if;

  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    return jsonb_build_object('error', 'charge_invalide');
  end if;

  for v_task in select value from jsonb_array_elements(p_tasks) loop
    v_key := coalesce(v_task->>'key', '');
    v_status := coalesce(v_task->>'mtxStatus', '');
    if v_key <> '' and v_status <> '' then
      v_map := jsonb_set(v_map, array[v_key], to_jsonb(v_status), true);
    end if;
  end loop;

  -- Autres agents ayant la même charge (binôme)
  for v_peer in
    select id, data
    from public.profiles
    where type = 'agent'
      and statut = 'valide'
      and id <> v_agent.id
      and data->'charge'->>'leaderId' = v_charge->>'leaderId'
      and data->'charge'->>'date' is not distinct from v_charge->>'date'
      and coalesce(data->'charge'->>'aircraft', '') = coalesce(v_charge->>'aircraft', '')
      and coalesce(data->'charge'->>'teamName', '') = coalesce(v_charge->>'teamName', '')
  loop
    v_peer_tasks := coalesce(v_peer.data->'charge'->'tasks', '[]'::jsonb);
    if jsonb_typeof(v_peer_tasks) <> 'array' then
      v_peer_tasks := '[]'::jsonb;
    end if;

    select coalesce(
      jsonb_agg(
        case
          when v_map ? concat_ws(
            '|',
            coalesce(t->>'seq', ''),
            lower(btrim(coalesce(t->>'description', ''))),
            coalesce(t->>'taskType', ''),
            coalesce(t->>'workArea', '')
          )
          then t || jsonb_build_object(
            'mtxStatus',
            v_map ->> concat_ws(
              '|',
              coalesce(t->>'seq', ''),
              lower(btrim(coalesce(t->>'description', ''))),
              coalesce(t->>'taskType', ''),
              coalesce(t->>'workArea', '')
            )
          )
          else t
        end
      ),
      '[]'::jsonb
    )
    into v_new_tasks
    from jsonb_array_elements(v_peer_tasks) as t;

    update public.profiles
    set data = jsonb_set(data, '{charge,tasks}', v_new_tasks),
        rev = rev + 1,
        updated_at = now()
    where id = v_peer.id;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$$;

grant execute on function public.agent_share_charge_status(text, jsonb) to anon, authenticated;
