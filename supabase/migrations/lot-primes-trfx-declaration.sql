-- ============================================================
-- AeroPrimes - TRFX facultatif a la declaration agent
-- A executer UNE SEULE FOIS dans Supabase > SQL Editor
-- (drop necessaire : ajout d'un parametre = nouvelle signature)
-- ============================================================

drop function if exists public.agent_submit_declaration(text, text, text, text, date, text);

create or replace function public.agent_submit_declaration(
  p_identifiant text,
  p_nom text,
  p_avion text,
  p_element text,
  p_date_intervention date,
  p_description text,
  p_trfx text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_manager uuid;
begin
  if length(trim(coalesce(p_avion, ''))) = 0 then
    return jsonb_build_object('error', 'avion_requis');
  end if;

  if length(trim(coalesce(p_element, ''))) = 0 then
    return jsonb_build_object('error', 'element_requis');
  end if;

  if length(coalesce(p_description, '')) = 0 then
    return jsonb_build_object('error', 'description_requise');
  end if;

  select manager_id into v_manager
  from public.agents
  where lower(identifiant) = trim(lower(p_identifiant));

  insert into public.declarations (
    agent_identifiant, agent_nom, avion, element, trfx,
    date_intervention, description, montant, statut, manager_id
  )
  values (
    trim(lower(p_identifiant)),
    coalesce(p_nom, ''),
    trim(p_avion),
    trim(p_element),
    trim(coalesce(p_trfx, '')),
    p_date_intervention,
    p_description,
    null,
    'soumise',
    v_manager
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.agent_submit_declaration(text, text, text, text, date, text, text) to anon, authenticated;
