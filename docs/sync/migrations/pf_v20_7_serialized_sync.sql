-- PF V20.7 additive RPC migration: commit-ordered changes and retained stale evidence.
-- Apply only after isolated PostgreSQL contract tests pass. No tables or rows dropped.
-- Existing RPC names, signatures and auth grants remain unchanged.

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

  -- Only transaction-scoped locks: automatically released on commit/rollback.
  -- The same per-user key is used by EVERY writer/compactor for this feed.
  perform pg_advisory_xact_lock(hashtextextended('project-freak:sync:' || v_user::text, 0));

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
  v_retained text[] := array[]::text[];
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

  -- Only transaction-scoped locks: automatically released on commit/rollback.
  -- The same per-user key is used by EVERY writer/compactor for this feed.
  perform pg_advisory_xact_lock(hashtextextended('project-freak:sync:' || v_user::text, 0));

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
        -- A stale offline edit is NOT a verified duplicate. Store the
        -- originally transmitted snapshot before acknowledging the outbox.
        -- Idempotent retry of the same payload does not multiply evidence.
        insert into public.project_freak_sync_conflicts (
          user_id, entity_type, entity_id, incoming_revision,
          existing_operation, incoming_operation,
          existing_payload_json, incoming_payload_json,
          resolved_operation, resolved_revision, resolved_payload_json,
          resolution_rule, created_at
        )
        select v_user, v_entity_type, v_entity_id, v_revision,
               v_existing.operation, v_operation,
               v_existing.payload_json, v_payload,
               v_existing.operation, v_existing.revision,
               v_existing.payload_json, 'stale_revision_retained', now()
        where not exists (
          select 1 from public.project_freak_sync_conflicts c
          where c.user_id = v_user
            and c.entity_type = v_entity_type
            and c.entity_id = v_entity_id
            and c.incoming_revision = v_revision
            and c.incoming_operation = v_operation
            and c.incoming_payload_json = v_payload
            and c.resolution_rule = 'stale_revision_retained'
        );
        v_retained := array_append(v_retained, v_outbox_id);
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
    'retained_conflict_outbox_ids', to_jsonb(v_retained),
    'error', coalesce(v_error,
      case when cardinality(v_retained) > 0 then
        cardinality(v_retained)::text || ' stale offline edit(s) preserved for recovery in the cloud conflict audit.'
      end)
  );
end;
$$;

