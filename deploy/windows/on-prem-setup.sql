-- ============================================================
-- AeroTeam on-premise — finalisation de la base (Windows)
-- À exécuter APRÈS la restauration du dump (migrate-data.md),
-- en tant que superutilisateur :
--   psql -U postgres -d aeroteam -f on-prem-setup.sql
-- ============================================================

-- 1) Extensions nécessaires (codes des profils : crypt/gen_salt)
create extension if not exists pgcrypto;

-- 2) Rôles PostgREST (sans erreur s'ils existent déjà)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'CHANGER_MOI';
  end if;
end $$;

grant anon to authenticator;
grant authenticated to authenticator;
grant connect on database aeroteam to authenticator;
grant usage on schema public to anon, authenticated;

-- 3) Autoriser l'exécution de TOUTES les RPC du schéma public
--    (les tables restent protégées : RLS + revoke des migrations)
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;

-- 4) Emails : désactivation complète (choix entreprise)
drop trigger if exists trg_notify_admin_new_registration on public.profiles;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('primes-recap-mensuel');
    exception when others then null;
    end;
  end if;
end $$;

-- 5) Vérifications rapides
--    (doit renvoyer ok = true)
select public.check_admin('code-admin-de-test') as check_admin_test;
