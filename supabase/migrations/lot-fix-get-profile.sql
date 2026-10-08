-- ============================================================
-- Correctif : rétablit la variante get_profile(p_code)
-- (profils sans identifiant / appels par code seul).
-- Elle avait été retirée par erreur par lot-profils-agents-2.sql,
-- ce qui provoquait :
--   « Could not find the function public.get_profile(p_code) »
-- lors de certaines assignations (ex. avion → leader).
-- À exécuter dans Supabase (SQL Editor).
-- ============================================================

create or replace function public.get_profile(p_code text)
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
    where code = p_code
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

grant execute on function public.get_profile(text) to anon, authenticated;
