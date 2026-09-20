-- ============================================================
-- Primes - historique agent (PARTIE 2/2) : suppressions manager (masquage)
-- A executer APRES la PARTIE 1
-- ============================================================

-- 3) Supprimer une demande : masquee si la personne a un compte, sinon supprimee
create or replace function public.admin_delete_declaration(
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
  v_admin_id uuid;
  v_ident text;
  v_nom text;
  v_protected boolean;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  select d.agent_identifiant, d.agent_nom
  into v_ident, v_nom
  from public.declarations d
  where d.id = p_id
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id))
  limit 1;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Personne avec un compte AeroPrimes : par identifiant OU par nom
  select exists (
    select 1 from public.agents ag
    where lower(ag.identifiant) = lower(coalesce(v_ident, ''))
       or public.norm_prime_name(ag.nom) = public.norm_prime_name(v_nom)
  ) into v_protected;

  if v_protected then
    update public.declarations set manager_hidden = true where id = p_id;
    return jsonb_build_object('ok', true, 'hidden', true);
  end if;

  delete from public.declarations where id = p_id;
  return jsonb_build_object('ok', true, 'hidden', false);
end;
$$;

-- 4) Supprimer tout l'historique d'une personne : p_ref = identifiant OU nom
create or replace function public.admin_delete_agent_declarations(
  p_admin_code text,
  p_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_admin boolean;
  v_admin_id uuid;
  v_hide integer := 0;
  v_del integer := 0;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  -- Masque les declarations dont la personne a un compte AeroPrimes
  update public.declarations d
  set manager_hidden = true
  where (lower(coalesce(d.agent_identifiant, '')) = lower(trim(p_ref))
         or public.norm_prime_name(d.agent_nom) = public.norm_prime_name(p_ref))
    and coalesce(d.manager_hidden, false) = false
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id))
    and exists (
      select 1 from public.agents ag
      where lower(ag.identifiant) = lower(coalesce(d.agent_identifiant, ''))
         or public.norm_prime_name(ag.nom) = public.norm_prime_name(d.agent_nom)
    );
  get diagnostics v_hide = row_count;

  -- Supprime les declarations sans compte correspondant
  delete from public.declarations d
  where (lower(coalesce(d.agent_identifiant, '')) = lower(trim(p_ref))
         or public.norm_prime_name(d.agent_nom) = public.norm_prime_name(p_ref))
    and (d.manager_id is null
         or d.manager_id = v_admin_id
         or not exists (select 1 from public.admins a where a.id = d.manager_id))
    and not exists (
      select 1 from public.agents ag
      where lower(ag.identifiant) = lower(coalesce(d.agent_identifiant, ''))
         or public.norm_prime_name(ag.nom) = public.norm_prime_name(d.agent_nom)
    );
  get diagnostics v_del = row_count;

  return jsonb_build_object('ok', true, 'count', v_del, 'hidden_count', v_hide);
end;
$$;

grant execute on function public.admin_list_declarations(text, text) to anon, authenticated;
grant execute on function public.admin_delete_declaration(text, uuid) to anon, authenticated;
grant execute on function public.admin_delete_agent_declarations(text, text) to anon, authenticated;