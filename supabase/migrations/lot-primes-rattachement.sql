-- ============================================================
-- Primes - rattachement des declarations a un compte AeroPrimes
-- A executer UNE SEULE FOIS dans Supabase > SQL Editor
--
-- Cas d'usage : un leader declare des primes pour une personne qui
-- n'a pas encore de compte AeroPrimes (les declarations sont stockees
-- avec son nom seulement). Quand la personne cree son compte, le
-- manager rattache ce compte : toutes ses declarations passees sont
-- enregistrees au meme identifiant et elle retrouve son historique.
-- ============================================================

create or replace function public.admin_link_agent_declarations(
  p_admin_code text,
  p_nom text,
  p_identifiant text
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
  v_count bigint;
begin
  select (public.check_admin(p_admin_code))->>'ok' into is_admin;
  if is_admin is distinct from 'true' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select id into v_admin_id
  from public.admins
  where crypt(p_admin_code, code_hash) = code_hash
  limit 1;

  -- Le compte AeroPrimes doit exister
  select identifiant into v_ident
  from public.agents
  where lower(identifiant) = lower(trim(p_identifiant))
  limit 1;
  if v_ident is null then
    return jsonb_build_object('error', 'agent_inconnu');
  end if;

  -- Declarations sans identifiant dont le nom correspond (dans le perimetre du manager)
  update public.declarations d
  set agent_identifiant = v_ident
  where coalesce(trim(d.agent_identifiant), '') = ''
    and lower(trim(d.agent_nom)) = lower(trim(p_nom))
    and (
      d.manager_id is null
      or d.manager_id = v_admin_id
      or not exists (select 1 from public.admins a where a.id = d.manager_id)
    );
  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'identifiant', v_ident
  );
end;
$$;

grant execute on function public.admin_link_agent_declarations(text, text, text) to anon, authenticated;
