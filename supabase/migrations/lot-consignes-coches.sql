-- Coches des lignes de consignes (partagées entre appareils) — page Affectation.
-- Table dédiée + RPC ; la clé est « profile_id | titre de la note | ligne ».

create table if not exists public.consigne_checks (
  check_key text primary key,
  checked boolean not null default true,
  checked_by text,
  updated_at timestamptz not null default now()
);

alter table public.consigne_checks enable row level security;
revoke all on table public.consigne_checks from anon, authenticated;

-- Toutes les coches existantes (map clé -> true)
create or replace function public.get_consigne_checks()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'checks', coalesce(jsonb_object_agg(check_key, true), '{}'::jsonb)
  )
  from public.consigne_checks
  where checked
$$;

-- Cocher / décocher une ligne
create or replace function public.set_consigne_check(p_key text, p_checked boolean, p_by text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'cle_vide');
  end if;
  if p_checked then
    insert into public.consigne_checks(check_key, checked, checked_by, updated_at)
    values (p_key, true, coalesce(p_by, ''), now())
    on conflict (check_key) do update
      set checked = true,
          checked_by = excluded.checked_by,
          updated_at = now();
  else
    delete from public.consigne_checks where check_key = p_key;
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Décocher tout
create or replace function public.clear_consigne_checks()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with d as (delete from public.consigne_checks returning 1)
  select jsonb_build_object('ok', true)
$$;

-- La lecture des consignes renvoie aussi l'id du profil (clé de coche stable)
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
      'profile_id', p.id,
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

grant execute on function public.get_consigne_checks() to anon, authenticated;
grant execute on function public.set_consigne_check(text, boolean, text) to anon, authenticated;
grant execute on function public.clear_consigne_checks() to anon, authenticated;
grant execute on function public.get_aircraft_consignes(text, text) to anon, authenticated;
