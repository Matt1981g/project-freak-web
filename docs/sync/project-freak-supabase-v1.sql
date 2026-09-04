-- PROJECT FREAK Supabase sync backend v1
-- Run in the Supabase SQL editor for the project used by PROJECT FREAK.

create table if not exists public.project_freak_sync_entities (
  user_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  revision integer not null check (revision >= 1),
  payload_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create table if not exists public.project_freak_sync_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  revision integer not null check (revision >= 1),
  payload_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists project_freak_sync_changes_user_id_id_idx
  on public.project_freak_sync_changes (user_id, id);

alter table public.project_freak_sync_entities enable row level security;
alter table public.project_freak_sync_changes enable row level security;

revoke all on public.project_freak_sync_entities from anon, authenticated;
revoke all on public.project_freak_sync_changes from anon, authenticated;

create or replace function public.project_freak_push_mutations(p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_existing public.project_freak_sync_entities%rowtype;
  v_ack text[] := array[]::text[];
  v_error text := null;
  v_entity_type text;
  v_entity_id text;
  v_operation text;
  v_revision integer;
  v_payload jsonb;
  v_outbox_id text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_mutations) <> 'array' then
    raise exception 'p_mutations must be a JSON array';
  end if;

  for v_item in select value from jsonb_array_elements(p_mutations)
  loop
    v_outbox_id := v_item->>'outbox_id';
    v_entity_type := v_item->>'entity_type';
    v_entity_id := v_item->>'entity_id';
    v_operation := v_item->>'operation';
    v_revision := (v_item->>'revision')::integer;
    v_payload := v_item->'payload_json';

    if v_outbox_id is null or v_entity_type is null or v_entity_id is null
       or v_operation not in ('upsert', 'delete')
       or v_revision is null or v_revision < 1 or v_payload is null then
      v_error := coalesce(v_error, 'Malformed mutation received.');
      continue;
    end if;

    select *
      into v_existing
      from public.project_freak_sync_entities
     where user_id = v_user
       and entity_type = v_entity_type
       and entity_id = v_entity_id;

    if found then
      if v_revision < v_existing.revision then
        v_error := coalesce(
          v_error,
          format('Remote revision is newer for %s:%s.', v_entity_type, v_entity_id)
        );
        continue;
      end if;

      if v_revision = v_existing.revision then
        if v_operation = v_existing.operation and v_payload = v_existing.payload_json then
          v_ack := array_append(v_ack, v_outbox_id);
        else
          v_error := coalesce(
            v_error,
            format('Revision conflict for %s:%s.', v_entity_type, v_entity_id)
          );
        end if;
        continue;
      end if;
    end if;

    insert into public.project_freak_sync_entities (
      user_id, entity_type, entity_id, operation, revision, payload_json, updated_at
    )
    values (
      v_user, v_entity_type, v_entity_id, v_operation, v_revision, v_payload, now()
    )
    on conflict (user_id, entity_type, entity_id)
    do update set
      operation = excluded.operation,
      revision = excluded.revision,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at;

    insert into public.project_freak_sync_changes (
      user_id, entity_type, entity_id, operation, revision, payload_json, updated_at
    )
    values (
      v_user, v_entity_type, v_entity_id, v_operation, v_revision, v_payload, now()
    );

    v_ack := array_append(v_ack, v_outbox_id);
  end loop;

  return jsonb_build_object(
    'acknowledged_outbox_ids', to_jsonb(v_ack),
    'remote_user_id', v_user::text,
    'error', v_error
  );
end;
$$;

create or replace function public.project_freak_pull_changes(
  p_cursor text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cursor bigint := coalesce(nullif(p_cursor, '')::bigint, 0);
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_changes jsonb;
  v_next_cursor bigint;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'remote_change_id', id::text,
          'entity_type', entity_type,
          'entity_id', entity_id,
          'operation', operation,
          'revision', revision,
          'payload_json', payload_json,
          'updated_at', updated_at
        )
        order by id
      ),
      '[]'::jsonb
    ),
    max(id)
  into v_changes, v_next_cursor
  from (
    select *
      from public.project_freak_sync_changes
     where user_id = v_user
       and id > v_cursor
     order by id
     limit v_limit
  ) q;

  return jsonb_build_object(
    'changes', v_changes,
    'next_cursor', coalesce(v_next_cursor, v_cursor)::text,
    'remote_user_id', v_user::text,
    'error', null
  );
end;
$$;

create or replace function public.project_freak_sync_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
  v_user uuid := auth.uid();
  v_entity_count bigint;
  v_change_count bigint;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select count(*)
    into v_entity_count
    from public.project_freak_sync_entities
   where user_id = v_user;

  select count(*)
    into v_change_count
    from public.project_freak_sync_changes
   where user_id = v_user;

  return jsonb_build_object(
    'contract_version', '1.0.0',
    'authenticated_user_id', v_user::text,
    'entity_count', v_entity_count,
    'change_count', v_change_count
  );
end;
$;

revoke all on function public.project_freak_push_mutations(jsonb) from public;
revoke all on function public.project_freak_pull_changes(text, integer) from public;
revoke all on function public.project_freak_sync_health() from public;

grant execute on function public.project_freak_push_mutations(jsonb) to authenticated;
grant execute on function public.project_freak_pull_changes(text, integer) to authenticated;
grant execute on function public.project_freak_sync_health() to authenticated;
