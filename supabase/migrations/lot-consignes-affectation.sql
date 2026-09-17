-- Consignes des avions pour la page Affectation
-- Retourne les notes [C] (jour × shift) portées par les profils ayant un avion,
-- afin de dispatcher la charge sans passer par Import consignes.
-- Formats acceptés : « [C] F-GZNO MERCREDI Matin » (multi-avions) et « [C] MERCREDI Matin » (historique).

create or replace function public.get_aircraft_consignes(p_day text, p_shift text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'consignes', coalesce(
      jsonb_agg(x order by x->>'profile_name', x->>'title'),
      '[]'::jsonb
    )
  )
  from (
    select jsonb_build_object(
      'profile_name', p.name,
      'aircraft', coalesce(p.aircraft, ''),
      'title', n->>'title',
      'content', n->>'content'
    ) as x
    from public.profiles p
    cross join lateral jsonb_array_elements(coalesce(p.data->'notes', '[]'::jsonb)) as n
    where coalesce(p.aircraft, '') <> ''
      and (n->>'title') like '[C] %'
      and upper(n->>'title') like '%' || upper(coalesce(p_day, '')) || '%'
      and upper(n->>'title') like '%' || upper(coalesce(p_shift, '')) || '%'
  ) sub
$$;

grant execute on function public.get_aircraft_consignes(text, text) to anon, authenticated;
