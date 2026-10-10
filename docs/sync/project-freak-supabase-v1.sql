-- PROJECT FREAK Supabase sync backend v1
-- Contract version: 1.0.0
-- Hardened RPC boundary: authenticated-only, entity allowlist, bounded
-- batches/payloads, payload-shape checks and safe numeric parsing.

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

create table if not exists public.project_freak_sync_conflicts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  incoming_revision integer not null check (incoming_revision >= 1),
  existing_operation text not null check (existing_operation in ('upsert', 'delete')),
  incoming_operation text not null check (incoming_operation in ('upsert', 'delete')),
  existing_payload_json jsonb not null,
  incoming_payload_json jsonb not null,
  resolved_operation text not null check (resolved_operation in ('upsert', 'delete')),
  resolved_revision integer not null check (resolved_revision >= 1),
  resolved_payload_json jsonb not null,
  resolution_rule text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_freak_sync_conflicts_user_entity_idx
  on public.project_freak_sync_conflicts (user_id, entity_type, entity_id, id desc);

alter table public.project_freak_sync_entities enable row level security;
alter table public.project_freak_sync_changes enable row level security;
alter table public.project_freak_sync_conflicts enable row level security;

revoke all on public.project_freak_sync_entities from anon, authenticated;
revoke all on public.project_freak_sync_changes from anon, authenticated;
revoke all on public.project_freak_sync_conflicts from public, anon, authenticated;

create or replace function public.project_freak_valid_entity_type(p_entity_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_entity_type in (
    'exercise',
    'exercise_alias',
    'gym_profile',
    'gym_exercise_availability',
    'programme_block',
    'workout_template',
    'template_exercise',
    'template_set',
    'template_set_component',
    'programmed_session',
    'programmed_session_exercise',
    'programmed_session_set',
    'programmed_set_component',
    'completed_session',
    'readiness_entry',
    'session_exercise',
    'set',
    'set_component',
    'exercise_metrics',
    'user_setting'
  );
$$;

-- Change rows contain complete entity snapshots, not deltas. Keeping only the
-- newest snapshot per entity preserves convergence while bounding change-log growth.
create or replace function public.project_freak_compact_changes(
  p_keep_latest_per_entity integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_keep integer := greatest(1, least(coalesce(p_keep_latest_per_entity, 1), 10));
  v_deleted integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  with ranked as (
    select
      id,
      row_number() over (
        partition by entity_type, entity_id
        order by id desc
      ) as row_rank
    from public.project_freak_sync_changes
    where user_id = v_user
  ), deleted as (
    delete from public.project_freak_sync_changes changes
    using ranked
    where changes.id = ranked.id
      and ranked.row_rank > v_keep
    returning changes.id
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

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
  v_payload_revision_text text;
  v_incoming_updated text;
  v_existing_updated text;
  v_incoming_device text;
  v_existing_device text;
  v_use_incoming boolean;
  v_resolved_operation text;
  v_resolved_revision integer;
  v_resolved_payload jsonb;
  v_resolution_rule text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_mutations) <> 'array' then
    raise exception 'p_mutations must be a JSON array';
  end if;

  if jsonb_array_length(p_mutations) > 250 then
    raise exception 'p_mutations exceeds the maximum batch size of 250';
  end if;

  if octet_length(p_mutations::text) > 2097152 then
    raise exception 'p_mutations exceeds the maximum payload size of 2 MiB';
  end if;

  for v_item in select value from jsonb_array_elements(p_mutations)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      v_error := coalesce(v_error, 'Mutation item must be a JSON object.');
      continue;
    end if;

    v_outbox_id := v_item->>'outbox_id';
    v_entity_type := v_item->>'entity_type';
    v_entity_id := v_item->>'entity_id';
    v_operation := v_item->>'operation';
    v_payload := v_item->'payload_json';

    if v_outbox_id is null
       or length(v_outbox_id) < 1
       or length(v_outbox_id) > 200
       or v_entity_id is null
       or length(v_entity_id) < 1
       or length(v_entity_id) > 200
       or not public.project_freak_valid_entity_type(v_entity_type)
       or v_operation not in ('upsert', 'delete')
       or jsonb_typeof(v_payload) <> 'object'
       or octet_length(v_payload::text) > 262144 then
      v_error := coalesce(v_error, 'Malformed or oversized mutation received.');
      continue;
    end if;

    if coalesce(v_item->>'revision', '') !~ '^[1-9][0-9]{0,8}$' then
      v_error := coalesce(v_error, 'Mutation revision must be a positive integer.');
      continue;
    end if;

    v_revision := (v_item->>'revision')::integer;

    v_payload_revision_text := coalesce(v_payload->>'revision', '');
    if v_payload->>'id' is distinct from v_entity_id
       or v_payload_revision_text !~ '^[1-9][0-9]{0,8}$'
       or (v_payload_revision_text)::integer <> v_revision
       or jsonb_typeof(v_payload->'updated_at') <> 'string'
       or jsonb_typeof(v_payload->'device_id') <> 'string' then
      v_error := coalesce(v_error, 'Mutation payload does not match the entity envelope.');
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
        v_ack := array_append(v_ack, v_outbox_id);
        continue;
      end if;

      if v_revision = v_existing.revision then
        if v_operation = v_existing.operation
           and v_payload = v_existing.payload_json then
          v_ack := array_append(v_ack, v_outbox_id);
          continue;
        end if;

        -- Two devices can derive the same next revision while offline. Resolve
        -- the race deterministically, retain both snapshots for audit/recovery,
        -- and advance the canonical entity so every device can converge.
        v_incoming_updated := coalesce(v_payload->>'updated_at', '');
        v_existing_updated := coalesce(v_existing.payload_json->>'updated_at', '');
        v_incoming_device := coalesce(v_payload->>'device_id', '');
        v_existing_device := coalesce(v_existing.payload_json->>'device_id', '');

        v_use_incoming :=
          v_incoming_updated > v_existing_updated
          or (
            v_incoming_updated = v_existing_updated
            and v_incoming_device > v_existing_device
          )
          or (
            v_incoming_updated = v_existing_updated
            and v_incoming_device = v_existing_device
            and v_payload::text > v_existing.payload_json::text
          );

        v_resolved_revision := v_existing.revision + 1;

        if v_use_incoming then
          v_resolved_operation := v_operation;
          v_resolved_payload := v_payload;
          v_resolution_rule := 'equal_revision_latest_updated_at_incoming';
        else
          v_resolved_operation := v_existing.operation;
          v_resolved_payload := v_existing.payload_json;
          v_resolution_rule := 'equal_revision_latest_updated_at_existing';
        end if;

        v_resolved_payload := jsonb_set(
          v_resolved_payload,
          '{revision}',
          to_jsonb(v_resolved_revision),
          true
        );

        insert into public.project_freak_sync_conflicts (
          user_id,
          entity_type,
          entity_id,
          incoming_revision,
          existing_operation,
          incoming_operation,
          existing_payload_json,
          incoming_payload_json,
          resolved_operation,
          resolved_revision,
          resolved_payload_json,
          resolution_rule,
          created_at
        )
        values (
          v_user,
          v_entity_type,
          v_entity_id,
          v_revision,
          v_existing.operation,
          v_operation,
          v_existing.payload_json,
          v_payload,
          v_resolved_operation,
          v_resolved_revision,
          v_resolved_payload,
          v_resolution_rule,
          now()
        );

        update public.project_freak_sync_entities
           set operation = v_resolved_operation,
               revision = v_resolved_revision,
               payload_json = v_resolved_payload,
               updated_at = now()
         where user_id = v_user
           and entity_type = v_entity_type
           and entity_id = v_entity_id;

        insert into public.project_freak_sync_changes (
          user_id,
          entity_type,
          entity_id,
          operation,
          revision,
          payload_json,
          updated_at
        )
        values (
          v_user,
          v_entity_type,
          v_entity_id,
          v_resolved_operation,
          v_resolved_revision,
          v_resolved_payload,
          now()
        );

        v_ack := array_append(v_ack, v_outbox_id);
        continue;
      end if;
    end if;

    insert into public.project_freak_sync_entities (
      user_id,
      entity_type,
      entity_id,
      operation,
      revision,
      payload_json,
      updated_at
    )
    values (
      v_user,
      v_entity_type,
      v_entity_id,
      v_operation,
      v_revision,
      v_payload,
      now()
    )
    on conflict (user_id, entity_type, entity_id)
    do update set
      operation = excluded.operation,
      revision = excluded.revision,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at;

    insert into public.project_freak_sync_changes (
      user_id,
      entity_type,
      entity_id,
      operation,
      revision,
      payload_json,
      updated_at
    )
    values (
      v_user,
      v_entity_type,
      v_entity_id,
      v_operation,
      v_revision,
      v_payload,
      now()
    );

    v_ack := array_append(v_ack, v_outbox_id);
  end loop;

  perform public.project_freak_compact_changes(1);

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
  v_cursor bigint := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_changes jsonb;
  v_next_cursor bigint;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_cursor is not null and p_cursor <> '' then
    if p_cursor !~ '^[0-9]{1,19}$'
       or length(p_cursor) > 19 then
      raise exception 'Invalid sync cursor';
    end if;

    begin
      v_cursor := p_cursor::bigint;
    exception
      when numeric_value_out_of_range or invalid_text_representation then
        raise exception 'Invalid sync cursor';
    end;
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
as $$
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
$$;

revoke all on function public.project_freak_valid_entity_type(text) from public, anon, authenticated;
revoke all on function public.project_freak_compact_changes(integer) from public, anon, authenticated;
revoke all on function public.project_freak_push_mutations(jsonb) from public, anon, authenticated;
revoke all on function public.project_freak_pull_changes(text, integer) from public, anon, authenticated;
revoke all on function public.project_freak_sync_health() from public, anon, authenticated;

grant execute on function public.project_freak_push_mutations(jsonb) to authenticated;
grant execute on function public.project_freak_pull_changes(text, integer) to authenticated;
grant execute on function public.project_freak_sync_health() to authenticated;
