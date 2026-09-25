-- ============================================================
-- AeroTeam — MESSAGERIE entre profils (texte + pièces jointes)
-- Conversation type Teams / WhatsApp : les fonctions ci-dessous
-- sont le seul accès (la table n'est jamais lue directement).
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
-- ============================================================

-- 1) Table des messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  sender_name text not null default '',
  recipient_id uuid not null,
  recipient_name text not null default '',
  body text not null default '',
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  attachment_data bytea,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_by_sender boolean not null default false,
  deleted_by_recipient boolean not null default false
);

create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at desc);

alter table public.messages enable row level security;

-- 2) Identification de l'appelant par son code de profil
create or replace function public.msg_caller(p_code text)
returns table (id uuid, nom text)
language sql
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.name), ''), p.identifiant)
  from public.profiles p
  where p.code = p_code
    and coalesce(p.statut, 'valide') <> 'refuse'
  limit 1;
$$;

-- 3) Contacts : tous les profils (sauf soi), avec l'avion géré
create or replace function public.msg_contacts(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'contacts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', coalesce(nullif(trim(p.name), ''), p.identifiant),
          'aircraft', coalesce(p.aircraft, '')
        )
        order by lower(coalesce(nullif(trim(p.name), ''), p.identifiant))
      )
      from public.profiles p
      where p.id <> me.id
        and coalesce(p.statut, 'valide') <> 'refuse'
    ), '[]'::jsonb)
  );
end;
$$;

-- 4) Conversations : dernier message + non-lus par contact
create or replace function public.msg_threads(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  result jsonb;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  with msgs as (
    select m.*,
      case when m.sender_id = me.id then m.recipient_id else m.sender_id end as contact_id,
      case when m.sender_id = me.id then m.recipient_name else m.sender_name end as contact_name,
      (m.recipient_id = me.id and m.read_at is null) as unread
    from public.messages m
    where (m.sender_id = me.id and not m.deleted_by_sender)
       or (m.recipient_id = me.id and not m.deleted_by_recipient)
  ),
  last as (
    select distinct on (contact_id)
      contact_id, contact_name, body, attachment_name, created_at
    from msgs
    order by contact_id, created_at desc
  ),
  counts as (
    select contact_id, count(*) filter (where unread) as unread_count
    from msgs
    group by contact_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'contact_id', l.contact_id,
      'contact_name', l.contact_name,
      'last_body', l.body,
      'last_attachment', l.attachment_name,
      'last_at', l.created_at,
      'unread', coalesce(c.unread_count, 0)
    )
    order by l.created_at desc
  )
  into result
  from last l
  join counts c using (contact_id);

  return jsonb_build_object('ok', true, 'threads', coalesce(result, '[]'::jsonb));
end;
$$;

-- 5) Fil d'une conversation (et marque comme lus les messages reçus)
create or replace function public.msg_thread(
  p_code text,
  p_contact_id uuid,
  p_limit integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  result jsonb;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  update public.messages
  set read_at = now()
  where recipient_id = me.id
    and sender_id = p_contact_id
    and read_at is null
    and not deleted_by_recipient;

  select jsonb_agg(x order by x->>'created_at')
  into result
  from (
    select jsonb_build_object(
      'id', m.id,
      'mine', (m.sender_id = me.id),
      'body', m.body,
      'attachment_name', m.attachment_name,
      'attachment_type', m.attachment_type,
      'attachment_size', m.attachment_size,
      'created_at', m.created_at,
      'read_at', m.read_at
    ) as x
    from public.messages m
    where ((m.sender_id = me.id and not m.deleted_by_sender)
        or (m.recipient_id = me.id and not m.deleted_by_recipient))
      and ((m.sender_id = me.id and m.recipient_id = p_contact_id)
        or (m.sender_id = p_contact_id and m.recipient_id = me.id))
    order by m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 300), 500))
  ) t;

  return jsonb_build_object('ok', true, 'messages', coalesce(result, '[]'::jsonb));
end;
$$;

-- 6) Envoi d'un message (pièce jointe facultative, 5 Mo max)
create or replace function public.msg_send(
  p_code text,
  p_to uuid,
  p_body text,
  p_attachment_name text default null,
  p_attachment_type text default null,
  p_attachment_data text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  dest record;
  v_body text;
  v_data bytea;
  v_id uuid;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select p.id, coalesce(nullif(trim(p.name), ''), p.identifiant) as nom
  into dest
  from public.profiles p
  where p.id = p_to and coalesce(p.statut, 'valide') <> 'refuse';
  if dest.id is null then
    return jsonb_build_object('error', 'destinataire_introuvable');
  end if;

  v_body := coalesce(trim(p_body), '');
  if length(v_body) > 4000 then
    return jsonb_build_object('error', 'message_trop_long');
  end if;

  if p_attachment_data is not null and length(trim(p_attachment_data)) > 0 then
    begin
      v_data := decode(p_attachment_data, 'base64');
    exception when others then
      return jsonb_build_object('error', 'piece_jointe_invalide');
    end;
    if octet_length(v_data) > 5242880 then
      return jsonb_build_object('error', 'piece_jointe_trop_lourde');
    end if;
  end if;

  if v_body = '' and v_data is null then
    return jsonb_build_object('error', 'message_vide');
  end if;

  insert into public.messages (
    sender_id, sender_name, recipient_id, recipient_name, body,
    attachment_name, attachment_type, attachment_size, attachment_data
  ) values (
    me.id, me.nom, dest.id, dest.nom, v_body,
    nullif(trim(coalesce(p_attachment_name, '')), ''),
    nullif(trim(coalesce(p_attachment_type, '')), ''),
    case when v_data is null then null else octet_length(v_data) end,
    v_data
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 7) Téléchargement d'une pièce jointe (participants uniquement)
create or replace function public.msg_attachment(p_code text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  m record;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into m
  from public.messages
  where id = p_id
    and (sender_id = me.id or recipient_id = me.id);

  if m.id is null or m.attachment_data is null then
    return jsonb_build_object('error', 'introuvable');
  end if;

  return jsonb_build_object(
    'ok', true,
    'name', m.attachment_name,
    'type', m.attachment_type,
    'size', m.attachment_size,
    'data', encode(m.attachment_data, 'base64')
  );
end;
$$;

-- 8) Nombre de messages non lus (pastille)
create or replace function public.msg_unread_count(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  n integer;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select count(*) into n
  from public.messages
  where recipient_id = me.id
    and read_at is null
    and not deleted_by_recipient;

  return jsonb_build_object('ok', true, 'count', n);
end;
$$;

-- 9) Suppression d'un message (côté appelant uniquement)
create or replace function public.msg_delete(p_code text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
begin
  select * into me from public.msg_caller(p_code);
  if me.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  update public.messages
  set deleted_by_sender = case when sender_id = me.id then true else deleted_by_sender end,
      deleted_by_recipient = case when recipient_id = me.id then true else deleted_by_recipient end
  where id = p_id
    and (sender_id = me.id or recipient_id = me.id);

  if not found then
    return jsonb_build_object('error', 'introuvable');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
