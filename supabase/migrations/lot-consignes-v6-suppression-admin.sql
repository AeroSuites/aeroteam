-- ============================================================
-- Consignes — suppression des dossiers réservée aux admins
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- La création de dossiers (semaines et avions) reste libre pour
-- tous les profils ; seule la SUPPRESSION devient admin-only.
-- ============================================================

drop function if exists public.delete_folder(uuid);

create or replace function public.delete_folder(p_id uuid, p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  delete from public.consignes_folders where id = p_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
