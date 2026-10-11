#!/usr/bin/env bash
# Disposable PostgreSQL integration test. Uses two real connections/transactions.
# The first push is deliberately kept UNCOMMITTED while a second push starts.
set -euo pipefail

ready="$(mktemp)"
rm -f "$ready"
a_log="$(mktemp)"
b_log="$(mktemp)"
trap 'rm -f "$ready" "$a_log" "$b_log"' EXIT

# The first user write gets a change ID but does not commit for two seconds.
# A second write for the same user must wait, even for a DIFFERENT entity.
psql -X -v ON_ERROR_STOP=1 >"$a_log" 2>&1 <<SQL &
begin;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select public.project_freak_push_mutations('[{"outbox_id":"a-1","entity_type":"set","entity_id":"race-a","operation":"upsert","revision":1,"payload_json":{"id":"race-a","revision":1,"device_id":"pc","updated_at":"2026-10-11T10:00:00Z","reps":8}}]'::jsonb);
\! touch "$ready"
select pg_sleep(2);
commit;
SQL
a_pid=$!

for attempt in $(seq 1 120); do
  if [[ -e "$ready" ]]; then break; fi
  if ! kill -0 "$a_pid" 2>/dev/null; then
    echo "First transaction failed to start"; cat "$a_log"; exit 1
  fi
  sleep 0.05
done
if [[ ! -e "$ready" ]]; then
  echo "First transaction never acquired the write lock"; cat "$a_log"; exit 1
fi

psql -X -v ON_ERROR_STOP=1 >"$b_log" 2>&1 <<'SQL' &
begin;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select public.project_freak_push_mutations('[{"outbox_id":"b-1","entity_type":"set","entity_id":"race-b","operation":"upsert","revision":1,"payload_json":{"id":"race-b","revision":1,"device_id":"phone","updated_at":"2026-10-11T10:01:00Z","reps":9}}]'::jsonb);
commit;
SQL
b_pid=$!

# With no per-owner lock, the second transaction commits during A's sleep.
sleep 0.6
if ! kill -0 "$b_pid" 2>/dev/null; then
  echo "Second transaction finished before the first committed; serialization failed"
  cat "$a_log" "$b_log"
  wait "$a_pid" || true
  exit 1
fi
wait "$a_pid" || { cat "$a_log"; exit 1; }
wait "$b_pid" || { cat "$b_log"; exit 1; }

psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $test$
declare
  v_first bigint;
  v_second bigint;
  v_total integer;
begin
  select id into v_first from public.project_freak_sync_changes
  where user_id = '33333333-3333-4333-8333-333333333333'
    and entity_id = 'race-a';
  select id into v_second from public.project_freak_sync_changes
  where user_id = '33333333-3333-4333-8333-333333333333'
    and entity_id = 'race-b';
  select count(*) into v_total from public.project_freak_sync_changes
  where user_id = '33333333-3333-4333-8333-333333333333';
  if v_first is null or v_second is null or v_total <> 2 or v_first >= v_second then
    raise exception 'Concurrent commits are not cursor-safe: first %, second %, total %',
      v_first, v_second, v_total;
  end if;
end;
$test$;
SQL

echo "PF concurrent per-user push and cursor-order contract PASS"
