-- Consignes des avions : ne renvoyer que les consignes du profil demandé.
-- Avant : chaque profil recevait les consignes de TOUS les profils avion.
-- À exécuter dans Supabase (SQL Editor).

drop function if exists public.get_aircraft_consignes(text, text);

create or replace function public.get_aircraft_consignes(
  p_day text,
  p_shift text,
  p_profile_id uuid default null
)
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
      'profile_id', p.id,
      'profile_name', p.name,
      'aircraft', coalesce(p.aircraft, ''),
      'title', n->>'title',
      'content', n->>'content'
    ) as x
    from public.profiles p
    cross join lateral jsonb_array_elements(coalesce(p.data->'notes', '[]'::jsonb)) as n
    where coalesce(p.aircraft, '') <> ''
      and (p_profile_id is null or p.id = p_profile_id)
      and (n->>'title') like '[C] %'
      and upper(n->>'title') like '%' || upper(coalesce(p_day, '')) || '%'
      and upper(n->>'title') like '%' || upper(coalesce(p_shift, '')) || '%'
  ) sub
$$;

grant execute on function public.get_aircraft_consignes(text, text, uuid) to anon, authenticated;
