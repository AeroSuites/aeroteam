-- ============================================================
-- Primes - historique agent (PARTIE 1/2) : normalisation + liste manager
-- A executer dans Supabase > SQL Editor, PUIS la PARTIE 2
-- ============================================================

-- ============================================================
-- Primes - historique agent protege lors des suppressions manager
-- A executer (ou RE-executer) UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Regle : quand une declaration concerne une personne qui a un compte
-- AeroPrimes (rattachement par identifiant OU par nom normalise), la
-- "suppression" cote manager ne fait que la MASQUER de la vue manager :
-- l'agent conserve tout son historique dans AeroPrimes.
-- Les declarations sans compte correspondant sont supprimees pour de vrai.
-- ============================================================

-- Normalisation des noms : minuscules, espaces compactes
create or replace function public.norm_prime_name(p text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

grant execute on function public.norm_prime_name(text) to anon, authenticated;

-- 1) Colonne de masquage cote manager
alter table public.declarations
  add column if not exists manager_hidden boolean not null default false;

-- 2) Liste manager : exclut les declarations masquees cote manager
create or replace function public.admin_list_declarations(
  p_admin_code text,
  p_statut text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  list jsonb;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  if p_statut = '' then
    select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into list
    from (
      select d.id::text as id, d.agent_identifiant, d.agent_nom, d.avion, d.element,
             d.trfx, d.date_intervention, d.description, d.categorie, d.montant,
             d.statut, d.motif_refus, d.decided_by, d.decided_at, d.created_at
      from public.declarations d
      where coalesce(d.manager_hidden, false) = false
        and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id))
    ) t;
  else
    select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into list
    from (
      select d.id::text as id, d.agent_identifiant, d.agent_nom, d.avion, d.element,
             d.trfx, d.date_intervention, d.description, d.categorie, d.montant,
             d.statut, d.motif_refus, d.decided_by, d.decided_at, d.created_at
      from public.declarations d
      where d.statut = p_statut
        and coalesce(d.manager_hidden, false) = false
        and (d.manager_id is null
             or d.manager_id = v_admin_id
             or not exists (select 1 from public.admins a where a.id = d.manager_id))
    ) t;
  end if;

  return jsonb_build_object('ok', true, 'declarations', list);
end;
$$;