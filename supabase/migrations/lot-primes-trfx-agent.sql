-- ============================================================
-- AeroPrimes - l'agent voit le TRFX de ses declarations
-- A executer UNE SEULE FOIS dans Supabase > SQL Editor
-- ============================================================

create or replace function public.my_declarations(p_identifiant text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  list jsonb;
begin
  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
  into list
  from (
    select id::text as id,
           agent_identifiant,
           avion, element, trfx, date_intervention, description,
           categorie, montant, statut, motif_refus, decided_by, decided_at, created_at
    from public.declarations
    where lower(agent_identifiant) = trim(lower(p_identifiant))
  ) t;

  return jsonb_build_object('ok', true, 'declarations', list);
end;
$$;

grant execute on function public.my_declarations(text) to anon, authenticated;
