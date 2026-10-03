-- ============================================================
-- AeroTeam — Consignes : modification d'un message envoyé
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
-- (l'auteur peut corriger son message, un administrateur aussi)
-- ============================================================

-- 1) Date de dernière modification
alter table public.consignes_messages
  add column if not exists edited_at timestamptz;

-- 2) Liste des messages : on renvoie aussi edited_at
create or replace function public.get_messages(p_dossier_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  list jsonb;
begin
  if p_dossier_id = '__none__' then
    select coalesce(jsonb_agg(t order by t.created_at), '[]'::jsonb)
    into list
    from (
      select id::text as id, auteur, contenu, contenu_html, auteur_key, images, created_at, edited_at
      from public.consignes_messages
      where dossier_id is null
    ) t;
  else
    select coalesce(jsonb_agg(t order by t.created_at), '[]'::jsonb)
    into list
    from (
      select id::text as id, auteur, contenu, contenu_html, auteur_key, images, created_at, edited_at
      from public.consignes_messages
      where dossier_id = p_dossier_id::uuid
    ) t;
  end if;

  return jsonb_build_object('ok', true, 'messages', list);
end;
$$;

-- 3) Modification d'un message : auteur (clé) ou administrateur (code)
create or replace function public.update_message(
  p_id uuid,
  p_contenu text,
  p_contenu_html text,
  p_auteur_key text,
  p_admin_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  m record;
  is_admin boolean := false;
begin
  if length(coalesce(p_contenu, '')) = 0 and length(coalesce(p_contenu_html, '')) = 0 then
    return jsonb_build_object('error', 'message_vide');
  end if;

  select * into m from public.consignes_messages where id = p_id;
  if m.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if coalesce(p_admin_code, '') <> '' then
    select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  end if;

  if not is_admin
     and (coalesce(p_auteur_key, '') = '' or m.auteur_key is null or m.auteur_key <> p_auteur_key)
  then
    return jsonb_build_object('error', 'not_allowed');
  end if;

  update public.consignes_messages
  set contenu = coalesce(p_contenu, ''),
      contenu_html = coalesce(p_contenu_html, ''),
      edited_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
