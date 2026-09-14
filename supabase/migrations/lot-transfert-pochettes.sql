-- ============================================================
-- Transfert de pochettes entre profils — POUR TOUS
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Chaque profil peut envoyer une de ses pochettes (avec ses
-- lignes de préparation) à un autre profil, pour une passation
-- de consigne. L'authentification se fait avec le code du
-- profil expéditeur ; la liste des destinataires ne contient
-- jamais les codes (nom + avion uniquement).
-- ============================================================

-- 1) Liste publique des profils (id + nom + avion, JAMAIS le code)
create or replace function public.list_profiles_public()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  list jsonb;
begin
  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb)
  into list
  from (
    select id::text as id, name, aircraft
    from public.profiles
    where statut = 'valide'
  ) t;

  return jsonb_build_object('ok', true, 'profiles', list);
end;
$$;

-- 2) Transférer une pochette vers un autre profil
create or replace function public.pocket_transfer_to(
  p_from_code text,
  p_to_id uuid,
  p_pocket jsonb,
  p_prep_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_from_id uuid;
begin
  select id into v_from_id
  from public.profiles
  where code = p_from_code
    and statut = 'valide';

  if v_from_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_to_id is null or p_to_id = v_from_id then
    return jsonb_build_object('error', 'cible_invalide');
  end if;

  if p_pocket is null or jsonb_typeof(p_pocket) <> 'object' then
    return jsonb_build_object('error', 'pochette_invalide');
  end if;

  update public.profiles p
  set data = jsonb_set(
        jsonb_set(
          coalesce(p.data, '{}'::jsonb),
          '{pockets}',
          coalesce(p.data->'pockets', '[]'::jsonb) || jsonb_build_array(p_pocket)
        ),
        '{prepTasks}',
        coalesce(p.data->'prepTasks', '[]'::jsonb) || coalesce(p_prep_tasks, '[]'::jsonb)
      ),
      rev = p.rev + 1,
      updated_at = now()
  where p.id = p_to_id
    and p.statut = 'valide';

  if not found then
    return jsonb_build_object('error', 'cible_invalide');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
