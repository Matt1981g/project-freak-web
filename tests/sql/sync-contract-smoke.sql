-- Runs only against the disposable PostgreSQL container in GitHub Actions.
-- Tests the PF RPC SQL contract; does NOT verify Supabase Auth / API gateway.
set role authenticated;

-- Every RPC must reject anonymous calls.
do $test$
begin
  begin
    perform public.project_freak_sync_health();
    raise exception 'Expected unauthenticated RPC rejection';
  exception when others then
    if sqlerrm <> 'Authentication required' then
      raise;
    end if;
  end;

  begin
    perform public.project_freak_pull_changes(null, 10);
    raise exception 'Expected unauthenticated pull rejection';
  exception when others then
    if sqlerrm <> 'Authentication required' then
      raise;
    end if;
  end;

  begin
    perform public.project_freak_push_mutations('[]'::jsonb);
    raise exception 'Expected unauthenticated mutation rejection';
  exception when others then
    if sqlerrm <> 'Authentication required' then
      raise;
    end if;
  end;
end;
$test$;

-- Pretend to be user A, then verify valid pushes and deterministic
-- same-revision conflict resolution while preserving both snapshots.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

do $test$
declare
  v_result jsonb;
begin
  v_result := public.project_freak_push_mutations(
    '[{"outbox_id":"outbox-a","entity_type":"set","entity_id":"set-1",
       "operation":"upsert","revision":1,
       "payload_json":{"id":"set-1","revision":1,"device_id":"pc",
         "updated_at":"2026-10-11T08:00:00Z","reps":8}}]'::jsonb
  );

  if v_result->'acknowledged_outbox_ids' <> '["outbox-a"]'::jsonb
     or v_result->>'remote_user_id' <> '11111111-1111-4111-8111-111111111111'
     or v_result->>'error' is not null then
    raise exception 'Valid first mutation not acknowledged: %', v_result;
  end if;

  -- Equal revision + divergent device snapshot must be resolved and audited.
  v_result := public.project_freak_push_mutations(
    '[{"outbox_id":"outbox-b","entity_type":"set","entity_id":"set-1",
       "operation":"upsert","revision":1,
       "payload_json":{"id":"set-1","revision":1,"device_id":"phone",
         "updated_at":"2026-10-11T08:02:00Z","reps":10}}]'::jsonb
  );

  if v_result->'acknowledged_outbox_ids' <> '["outbox-b"]'::jsonb
     or v_result->>'error' is not null then
    raise exception 'Conflicting mutation did not converge: %', v_result;
  end if;

  v_result := public.project_freak_pull_changes(null, 20);
  if jsonb_array_length(v_result->'changes') <> 1
     or (v_result->'changes'->0->>'revision')::integer <> 2 then
    raise exception 'Pull must return the resolved revision-2 snapshot: %', v_result;
  end if;

  v_result := public.project_freak_sync_health();
  if (v_result->>'entity_count')::integer <> 1
     or (v_result->>'change_count')::integer <> 1 then
    raise exception 'Unexpected compacted sync health: %', v_result;
  end if;

  -- Stale nonidentical uploads must be durably retained for recovery,
  -- and repeated delivery after a timeout must not create duplicate evidence.
  v_result := public.project_freak_push_mutations(
    '[{"outbox_id":"old-offline","entity_type":"set","entity_id":"set-1",
       "operation":"upsert","revision":1,
       "payload_json":{"id":"set-1","revision":1,"device_id":"tablet",
         "updated_at":"2026-10-11T09:00:00Z","reps":12}}]'::jsonb
  );
  if v_result->'acknowledged_outbox_ids' <> '["old-offline"]'::jsonb
     or v_result->'retained_conflict_outbox_ids' <> '["old-offline"]'::jsonb
     or v_result->>'error' is null then
    raise exception 'Stale edit was not durably acknowledged as retained: %', v_result;
  end if;

  v_result := public.project_freak_push_mutations(
    '[{"outbox_id":"old-offline","entity_type":"set","entity_id":"set-1",
       "operation":"upsert","revision":1,
       "payload_json":{"id":"set-1","revision":1,"device_id":"tablet",
         "updated_at":"2026-10-11T09:00:00Z","reps":12}}]'::jsonb
  );
  if v_result->'retained_conflict_outbox_ids' <> '["old-offline"]'::jsonb then
    raise exception 'Retried stale upload did not preserve recovery classification: %', v_result;
  end if;

    -- Reject an unapproved entity type without acknowledging its outbox entry.
  v_result := public.project_freak_push_mutations(
    '[{"outbox_id":"bad","entity_type":"unapproved","entity_id":"x",
       "operation":"upsert","revision":1,
       "payload_json":{"id":"x","revision":1,"device_id":"pc",
         "updated_at":"2026-10-11T08:04:00Z"}}]'::jsonb
  );
  if v_result->'acknowledged_outbox_ids' <> '[]'::jsonb
     or v_result->>'error' is null then
    raise exception 'Unapproved entity was accepted: %', v_result;
  end if;
end;
$test$;

-- A different authenticated user must never see user A's data through RPCs.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $test$
declare
  v_result jsonb;
begin
  v_result := public.project_freak_sync_health();
  if (v_result->>'entity_count')::integer <> 0
     or (v_result->>'change_count')::integer <> 0 then
    raise exception 'Cross-user sync health disclosure: %', v_result;
  end if;

  v_result := public.project_freak_pull_changes(null, 100);
  if jsonb_array_length(v_result->'changes') <> 0 then
    raise exception 'Cross-user change disclosure: %', v_result;
  end if;
end;
$test$;

reset role;

-- Privileged test inspection: the API-facing roles must not have SELECT
-- access to backing tables and conflicts must be recorded durably.
do $test$
declare
  v_revision integer;
  v_conflicts integer;
begin
  if has_table_privilege('authenticated',
       'public.project_freak_sync_entities', 'SELECT') then
    raise exception 'Backing sync entity table is exposed to API role';
  end if;

  select revision into v_revision
  from public.project_freak_sync_entities
  where user_id = '11111111-1111-4111-8111-111111111111'
    and entity_type = 'set'
    and entity_id = 'set-1';

  if v_revision <> 2 then
    raise exception 'Resolved entity revision should be 2, found %', v_revision;
  end if;

  select count(*) into v_conflicts
  from public.project_freak_sync_conflicts
  where user_id = '11111111-1111-4111-8111-111111111111'
    and entity_id = 'set-1'
    and resolved_revision = 2
    and resolution_rule like 'equal_revision_%';

  if v_conflicts <> 1 then
    raise exception 'Expected exactly one equal-revision conflict audit, found %', v_conflicts;
  end if;

  select count(*) into v_conflicts
  from public.project_freak_sync_conflicts
  where user_id = '11111111-1111-4111-8111-111111111111'
    and entity_id = 'set-1'
    and resolution_rule = 'stale_revision_retained';

  if v_conflicts <> 1 then
    raise exception 'Retried stale upload was not idempotently retained, count %', v_conflicts;
  end if;
end;
$test$;

select 'PF disposable database RPC contract checks PASS' as result;
