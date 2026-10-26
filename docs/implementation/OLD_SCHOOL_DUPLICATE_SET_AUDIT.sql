-- PROJECT FREAK: read-only audit for duplicate workout sets.
-- Run only in an authorised, private database session.
-- Never commit query results (personal workout records) to GitHub.
-- No INSERT, UPDATE, DELETE, DDL, or mutation.
--
-- A logical set slot = user + session_exercise_id + set_number.
-- A duplicate slot is not proof of a redundant workout: retain both original entity IDs.
WITH live_sets AS (
  SELECT user_id, entity_id, revision, updated_at,
         payload_json ->> 'session_exercise_id' AS session_exercise_id,
         payload_json ->> 'set_number' AS set_number,
         payload_json ->> 'completed_session_id' AS completed_session_id,
         payload_json ->> 'load_kg' AS load_kg,
         payload_json ->> 'completed_reps' AS completed_reps,
         payload_json ->> 'rpe' AS rpe,
         payload_json ->> 'completed_at' AS completed_at,
         payload_json ->> 'device_id' AS device_id,
         payload_json ->> 'source_kind' AS source_kind
  FROM public.project_freak_sync_entities
  WHERE entity_type = 'set'
    AND operation = 'upsert'
    AND payload_json ->> 'deleted_at' IS NULL
),
duplicates AS (
  SELECT user_id, session_exercise_id, set_number,
         count(*) AS entities,
         count(DISTINCT jsonb_build_array(load_kg, completed_reps, rpe)) AS distinct_performances
  FROM live_sets
  GROUP BY user_id, session_exercise_id, set_number
  HAVING count(*) > 1
)
SELECT count(*) AS duplicate_slots,
       coalesce(sum(entities - 1), 0) AS extra_entities,
       count(*) FILTER (WHERE distinct_performances > 1) AS differing_performance_slots
FROM duplicates;

-- For a PRIVATE forensic review, inspect original IDs and data together:
WITH live_sets AS (
  SELECT user_id, entity_id, revision, updated_at, payload_json,
         payload_json ->> 'session_exercise_id' AS session_exercise_id,
         payload_json ->> 'set_number' AS set_number
  FROM public.project_freak_sync_entities
  WHERE entity_type = 'set' AND operation = 'upsert'
    AND payload_json ->> 'deleted_at' IS NULL
),
duplicate_slots AS (
  SELECT user_id, session_exercise_id, set_number
  FROM live_sets
  GROUP BY user_id, session_exercise_id, set_number
  HAVING count(*) > 1
)
SELECT s.entity_id, s.revision, s.updated_at,
       s.session_exercise_id, s.set_number,
       s.payload_json ->> 'completed_session_id' AS completed_session_id,
       s.payload_json ->> 'load_kg' AS load_kg,
       s.payload_json ->> 'completed_reps' AS completed_reps,
       s.payload_json ->> 'rpe' AS rpe,
       s.payload_json ->> 'completed_at' AS completed_at,
       s.payload_json ->> 'device_id' AS device_id,
       s.payload_json ->> 'source_kind' AS source_kind
FROM live_sets s
JOIN duplicate_slots d
  ON s.user_id = d.user_id
 AND s.session_exercise_id IS NOT DISTINCT FROM d.session_exercise_id
 AND s.set_number IS NOT DISTINCT FROM d.set_number
ORDER BY s.session_exercise_id, s.set_number, s.updated_at, s.entity_id;

-- Recovery gate:
-- 1. Obtain a verified, isolated-restorable full data copy including device outboxes.
-- 2. Preserve both conflicting versions and their provenance in the audit trail.
-- 3. Reconcile only with evidence (not timestamp-only last-write-wins).
-- 4. Rerun integrity + rollback tests before any production publication.
