-- Import automatique des consignes : stockage ADMIN + journal des lectures.
-- Alimenté par l'Edge Function import-consignes (service role).
-- Règle : l'automatisme met à jour le stockage admin (consignes + effectif par avion) ;
-- il ne modifie JAMAIS les profils leaders (l'assignation à un leader reste manuelle).

create table if not exists public.import_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text,
  file_name text,
  days jsonb default '[]'::jsonb,
  aircraft_updated int not null default 0,
  aircraft_skipped jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb
);

alter table public.import_runs enable row level security;
revoke all on table public.import_runs from anon, authenticated;

-- Dernière analyse complète (rapport jour → avions/effectif/consignes)
create table if not exists public.consignes_imports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  file_name text,
  aircraft_count int not null default 0,
  report jsonb not null
);

alter table public.consignes_imports enable row level security;
revoke all on table public.consignes_imports from anon, authenticated;

-- Rapport de la dernière réception automatique (lu par la page Import consignes)
create or replace function public.get_consignes_import()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'import', jsonb_build_object(
          'at', i.created_at,
          'file_name', i.file_name,
          'aircraft_count', i.aircraft_count,
          'report', i.report
        )
      )
      from public.consignes_imports i
      order by i.created_at desc
      limit 1
    ),
    jsonb_build_object('ok', true, 'import', null)
  )
$$;

-- Statut de la dernière lecture (affichage « Dernière mise à jour auto : ... »)
create or replace function public.get_last_import()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'last', jsonb_build_object(
          'at', r.created_at,
          'file_name', r.file_name,
          'aircraft_updated', r.aircraft_updated,
          'aircraft_skipped', r.aircraft_skipped,
          'source', r.source
        )
      )
      from public.import_runs r
      order by r.created_at desc
      limit 1
    ),
    jsonb_build_object('ok', true, 'last', null)
  )
$$;

grant execute on function public.get_consignes_import() to anon, authenticated;
grant execute on function public.get_last_import() to anon, authenticated;
