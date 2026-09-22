-- ============================================================
-- Purge des consignes des jours passés (admin)
-- À exécuter dans Supabase > SQL Editor (ré-exécutable sans risque)
--
-- Supprime les notes [C] dont le jour est antérieur à aujourd'hui
-- (LUNDI..SAMEDI, DIMANCHE), pour ne pas accumuler les jours déjà
-- traités dans le Bloc-notes des avions.
-- Le jour est cherché dans le titre, que celui-ci soit
-- « [C] MERCREDI Matin » ou « [C] F-GZNO MERCREDI Matin » (immat).
-- ============================================================

create or replace function public.admin_purge_consignes(
  p_admin_code text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  today_idx integer;
  new_notes jsonb;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  today_idx := extract(isodow from now())::integer; -- 1 = lundi ... 7 = dimanche

  select jsonb_agg(n)
  into new_notes
  from jsonb_array_elements(coalesce(
    (select data->'notes' from public.profiles where id = p_id),
    '[]'::jsonb
  )) as n
  where not (
    n->>'title' ~ '^\[C\] '
    and case coalesce((
          select w
          from unnest(string_to_array(upper(n->>'title'), ' ')) as w
          where w in ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE')
          limit 1
        ), '')
          when 'LUNDI' then 1
          when 'MARDI' then 2
          when 'MERCREDI' then 3
          when 'JEUDI' then 4
          when 'VENDREDI' then 5
          when 'SAMEDI' then 6
          when 'DIMANCHE' then 7
          else 99
        end < today_idx
  );

  update public.profiles
  set data = jsonb_set(data, '{notes}', coalesce(new_notes, '[]'::jsonb), true)
  where id = p_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;