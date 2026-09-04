# PROJECT FREAK Web App Specification v1.0

**Status:** LOCKED TECHNICAL BLUEPRINT  
**Specification date:** 2026-09-04  
**Canonical historical source:** `Project_Freak_Browser_Import_COMPLETE_2026-09-04(1).xlsx`  
**Canonical workbook SHA-256:** `76df3acfaaefb53b89b7f6e93a2ddb76c802fa5e517f908c524336cc4532d127`  
**Canonical workbook size:** 202,393 bytes  
**Primary goal:** a fast, durable, local-first hypertrophy training log and coaching bridge that works as an installable iPhone PWA and a Windows browser app.

---

## 1. Executive decision

PROJECT FREAK will be built as a **local-first Progressive Web App** using React, TypeScript, Vite, Dexie/IndexedDB, a custom gym-oriented UI layer, a versioned domain model, and a repository boundary that keeps storage and future sync out of the React components.

The app is not a generic workout tracker and it is not an autonomous AI coach. Its first job is to make set logging faster than paper while preserving enough structured data for serious hypertrophy analysis later.

The architecture is deliberately biased toward:
- immediate local writes;
- deterministic, auditable rules;
- stable identifiers;
- immutable historical actuals;
- explicit provenance;
- versioned imports/exports;
- safe schema migration;
- future multi-device sync without rewriting the UI;
- very low interaction cost during a live workout.

The successful interaction ideas from the previous Android build are retained conceptually: direct exercise cards, visible target/rest/notes, fast load/reps/failure entry, end-of-exercise scoring, history, and progression hints. The Android-specific Kotlin/Compose implementation is not ported. The web app starts cleanly at the domain/data layer while preserving the workflow that was working.

**Confidence: 0.97**

---

## 2. What the canonical workbook actually contains

### 2.1 Workbook structure

| Sheet | Used range | Role |
|---|---:|---|
| Set Data | A1:AA1324 | Canonical set-level history for import |
| Session Summary | A1:P51 | Session metadata and reconciliation |
| Exercise Summary | A1:J147 | Derived aggregate/reconciliation data |
| Data Audit | A1:B9 | Known edge cases and data-quality notes |
| README | A1:B13 | Canonical interpretation rules |

### 2.2 Verified dataset facts

- Date coverage: **2026-06-20 to 2026-09-04**
- Recorded sessions: **50**
- Set records: **1,323**
- Session-exercise groups: **403**
- Exact exercise labels: **146**
- Case-insensitive exercise labels: **119**
- Case-only duplicate groups: **27**
- Recommended workbook row key `(Workout ID, Exercise Order, Set)` has **zero duplicates**
- Failure-marked sets: **200**
- Rows whose workbook Set Type is `failure`: **199**
- Therefore **failure status is not the same thing as set structure**
- Set Type counts:
  - straight: 1,119
  - failure: 199
  - drop: 2
  - partials: 1
  - drop-unquantified: 1
  - rest-pause: 1
- Load Type counts:
  - normal: 1,312
  - assistance: 7
  - band+machine: 4
- Numeric exercise-level metric coverage:
  - RPE: 1,068 set rows
  - Pump: 1,068
  - Form: 546
  - Legacy Tension: 49
  - Legacy MMC: 49
- Within a given session + exercise, repeated RPE/Pump/Form/Tension/MMC values are internally consistent. This supports normalising them into one exercise-level metric record while retaining the untouched imported source row for audit.

### 2.3 Canonical workbook rules to preserve

1. Blank means unknown/not recorded. The importer never fills a blank by inference.
2. `13F` means 13 completed repetitions and the attempted next rep failed. Comparable tonnage uses 13.
3. Rest-pause and quantified drop components count only when explicitly recorded.
4. Partials remain recorded but do not count in normal comparable kg-rep tonnage.
5. Assistance loads and band-augmented resistance with unknown effective resistance do not receive misleading comparable tonnage.
6. Legacy Tension/MMC remain legacy fields and are not silently mapped to Form.
7. Every imported historical row retains Data Status and Source.
8. `Exercise Summary` is reconciliation data, not a replacement for Set Data.
9. Case variants and near-duplicate exercise names are **not silently merged** during import.
10. Historical local clock times are preserved exactly. A timezone/UTC timestamp is not fabricated where the source does not explicitly establish one.

### 2.4 Historical edge cases that the new model must support

- Quantified drop: `16 + 4 drop @12 kg`
- Quantified second component: e.g. `81 × 12 + 72 × 4`
- Partials: `16 full + 8 partials`
- Unquantified drop: `20F (DS)` with no drop load/reps
- Rest-pause: `25 kg × 14 + 4 rest-pause`
- Assisted pull-ups where logged load is assistance rather than effective moved load
- Machine + resistance band where total effective resistance is unknown
- Timed holds such as `60s`, `40s`, `35s` and `max effort hold`
- Unilateral notation such as `10L + 10R` and unilateral failure
- Legacy split notation such as `5+3`, `6+2`, `8+2`, `10+2` that must not be reinterpreted unless the source explicitly identifies the structure

**Confidence: 0.99**

---

## 3. Technology baseline

Versions below are the implementation baseline verified on 2026-09-04. Exact versions will be committed in the lockfile.

| Concern | Choice | Initial baseline | Rationale |
|---|---|---:|---|
| Runtime | Node.js LTS | 24.20.0 | Production LTS rather than current-release churn |
| Package manager | npm | version bundled with Node 24 LTS | Least setup friction on Windows |
| UI framework | React | 19.2.8 | Stable current React |
| Language | TypeScript | **6.0.3** | Deliberately not TS 7.0 yet; TS 7.0 has no stable programmatic API and ecosystem tooling may still need TS6 |
| Build | Vite | 8.2.2 | Stable Vite 8, fast dev/build, PWA ecosystem |
| React Vite plugin | @vitejs/plugin-react | 6.1.x stable | Standard React integration |
| Routing | React Router | **7.18.3** | Stable v7 line; v8 is too newly released to buy us anything useful |
| Local DB | Dexie | 4.4.5 | Mature IndexedDB abstraction |
| React DB bindings | dexie-react-hooks | 4.4.0 | Live local queries without coupling UI to raw IndexedDB |
| Runtime validation | Zod | 4.5.4 | Shared runtime/type schema and JSON Schema generation |
| PWA | vite-plugin-pwa | 1.3.0 | Manifest + Workbox/service-worker integration |
| XLSX import/export | SheetJS CE | 0.20.3 | Install from official SheetJS tarball, not stale npm `xlsx` 0.18.5 |
| Unit/integration tests | Vitest | 4.1.10 | Stable line; avoid adopting a just-released/beta major during foundation work |
| Component tests | React Testing Library | 16.3.2 | User-behaviour-focused component tests |
| IndexedDB test double | fake-indexeddb | 6.2.5 | Deterministic repository tests in Node |
| E2E | Playwright | 1.62.1 | Chromium + WebKit automation |
| Styling | CSS Modules + CSS custom properties | built-in | No UI-framework lock-in; precise touch-oriented design |
| Icons | Lucide React | optional, pinned when installed | Lightweight icons; labels remain primary for critical actions |

### Deliberate non-choices

- No Redux by default. The database is durable state; transient live-workout UI state can use React state/context.
- No heavyweight component suite such as MUI for the core logger. We need gym-sized controls, not an admin dashboard wearing sportswear.
- No backend in the core logger phase.
- No AI SDK or embedded LLM in the logger.
- No TypeScript 7.0 dependency until its ecosystem/API situation is suitable for the project.
- No browser LocalStorage as the primary database.
- No service-worker cache as a substitute for the database.

**Confidence: 0.94**

---

## 4. Architectural layers

```text
React UI / Feature Screens
        |
Application Use Cases
(start session, complete set, finish exercise, import programme, etc.)
        |
Domain Model + Deterministic Rules
(tonnage, progression hints, validation, set structure)
        |
Repository Interfaces
        |
+----------------------+----------------------+
| Local Repository     | Future Sync Adapter  |
| Dexie / IndexedDB    | provider-agnostic    |
+----------------------+----------------------+
        |
Import / Export / Backup / Migration Infrastructure
```

### 4.1 Presentation layer

React components and feature routes. Components do not issue raw IndexedDB calls.

### 4.2 Application layer

Explicit use cases such as:
- `startWorkout`
- `completeSet`
- `updateSet`
- `finishExercise`
- `finishSession`
- `importHistoricalWorkbook`
- `importProgramme`
- `exportTrainingData`
- `backupDatabase`
- `restoreDatabase`

This is where transactions and user-intent boundaries live.

### 4.3 Domain layer

Pure or near-pure business rules:
- failure interpretation;
- set component validation;
- comparable tonnage calculation;
- progression suggestion rules;
- programme structure validation;
- pairing sequence;
- rest target logic;
- historical-data invariants.

Domain functions must be unit-testable without React or IndexedDB.

### 4.4 Repository layer

Interfaces such as:
- `ExerciseRepository`
- `TemplateRepository`
- `ProgrammeRepository`
- `SessionRepository`
- `HistoryRepository`
- `ImportRepository`
- `AuditRepository`
- `SettingsRepository`
- `SyncOutboxRepository`

Dexie implements these in v1. Future cloud sync consumes the same application/domain objects rather than becoming entangled with screen code.

**Confidence: 0.97**

---

## 5. Record identity, timestamps and mutation rules

### 5.1 IDs

All new entities receive client-generated UUIDs using `crypto.randomUUID()`.

Historical imported records also receive internal UUIDs, but retain stable source keys.

### 5.2 Historical idempotency key

For the canonical workbook:

```text
project-freak-historical:xlsx:v1:<WorkoutID>:<ExerciseOrder>:<Set>
```

Example:

```text
project-freak-historical:xlsx:v1:W42:5:4
```

The workbook’s verified unique key is independent of the physical filename and protects against duplicate imports even if the same workbook is renamed.

### 5.3 Row fingerprint

Each source row also receives a canonical SHA-256 fingerprint. On re-import:
- same key + same fingerprint = already imported;
- same key + changed fingerprint = show a conflict/diff;
- no silent duplicate;
- no silent overwrite.

### 5.4 Common mutable-record metadata

Most user/domain records carry:

| Field | Type | Meaning |
|---|---|---|
| id | UUID string | Stable client-generated identity |
| created_at | ISO UTC timestamp | First creation |
| updated_at | ISO UTC timestamp | Last mutation |
| deleted_at | ISO UTC timestamp \| null | Soft delete/tombstone |
| revision | integer | Monotonic local revision |
| device_id | UUID string | Device that made latest mutation |
| source_kind | enum | `user`, `programme_import`, `historical_import`, `restore`, `sync` |
| source_id | string \| null | Import batch / external reference |

### 5.5 Time representation

For newly logged workouts:
- `session_date_local`: ISO date
- `timezone`: IANA timezone from device
- `started_at` / `completed_at`: UTC timestamps
- local display derived from timezone

For historical imports:
- source Date, Start and Finish strings are preserved exactly;
- UTC timestamps remain null unless the source provides enough information to establish them without inference;
- provenance stores the source values verbatim.

**Confidence: 0.98**

---

## 6. Database schema and data dictionary

The database is called `project-freak`. Dexie schema versions are integer migrations; the application data contract uses semantic schema versions.

### 6.1 Schema/versioning

#### `schema_meta`
Singleton database metadata.

- `key`: `"main"`
- `db_schema_version`: integer
- `data_contract_version`: string
- `created_at`
- `updated_at`

#### `migration_history`
One row per applied migration.

- `version`: integer, unique
- `app_version`
- `migration_name`
- `migration_checksum`
- `applied_at`
- `result`

### 6.2 Device/settings

#### `devices`
- `id`
- `display_name`
- `platform`
- `first_seen_at`
- `last_seen_at`

#### `settings`
- `key`
- `value_json`
- `updated_at`
- `device_id` when device-scoped

Settings distinguish global preferences from device-only preferences such as haptics/sound.

### 6.3 Exercise library

#### `exercises`
Reusable exercise definition.

- common metadata
- `canonical_name`
- `short_name` nullable
- `category` nullable
- `equipment` nullable
- `default_load_type`
- `rep_mode_default`: `total`, `per_side`, `timed`, `mixed`
- `archived_at` nullable
- `notes` nullable

**Historical rule:** renaming an exercise changes the library definition only. Historical session rows retain an exercise-name snapshot.

#### `exercise_aliases`
- `id`
- `exercise_id`
- `alias`
- `normalized_alias`
- `source_id`
- `created_at`

Initial historical import does not auto-merge the 27 case-only duplicate groups. It creates exact source labels and emits alias candidates for later explicit review.

#### `muscles`
- `id`
- `name`
- `region`

#### `exercise_muscles`
- `id`
- `exercise_id`
- `muscle_id`
- `role`: `primary`, `secondary`, `stabilizer`
- `allocation_weight` nullable

The allocation field is reserved for later direct-set analysis; no arbitrary fractional volume rules are invented in v1.

### 6.4 Programme blocks / mesocycles

#### `programme_blocks`
- common metadata
- `name`
- `block_type`: e.g. `mesocycle`, `microcycle`, `custom`
- `start_date_local` nullable
- `end_date_local` nullable
- `status`: `draft`, `active`, `completed`, `archived`
- `goal` nullable
- `notes` nullable

### 6.5 Workout templates

Templates describe reusable programming, not completed training.

#### `workout_templates`
- common metadata
- `programme_block_id` nullable
- `name`
- `day_label` nullable
- `template_family_id` UUID
- `version_number` integer
- `status`: `draft`, `active`, `retired`
- `notes` nullable

**Version rule:** once a template version has been used to create a programmed/completed session, substantive edits create a new template version rather than rewriting history.

#### `template_exercises`
- common metadata
- `workout_template_id`
- `exercise_id`
- `planned_order`
- `rotation_group_key` nullable, e.g. `A`
- `rotation_position` nullable, e.g. `1` / `2`
- `target_sets`
- `target_rep_min` nullable
- `target_rep_max` nullable
- `rest_seconds` nullable
- `tempo` nullable
- `technique_cue` nullable
- `notes` nullable

#### `template_sets`
- common metadata
- `template_exercise_id`
- `set_number`
- `set_role`: `warmup`, `work`
- `structure_type`: `straight`, `drop`, `rest_pause`, `myo_rep`, `partials`, `other`
- `target_rep_min` nullable
- `target_rep_max` nullable
- `target_duration_seconds` nullable
- `target_load_kg` nullable
- `target_load_type`
- `failure_target`: `none`, `allowed`, `target`
- `notes` nullable

#### `template_set_components`
Structured prescribed intensifier components.

- `id`
- `template_set_id`
- `sequence`
- `component_type`: `drop`, `rest_pause`, `myo_cluster`, `partials`, `other`
- `target_load_kg` nullable
- `load_relation`: `absolute`, `same_as_primary`, `percentage_of_primary`, `unknown`
- `target_load_percent` nullable
- `target_rep_min` nullable
- `target_rep_max` nullable
- `target_duration_seconds` nullable
- `failure_target`
- `notes` nullable

### 6.6 Programmed session snapshots

A programmed session is a concrete snapshot for a date/week. It protects planned history from later template edits.

#### `programmed_sessions`
- common metadata
- `programme_block_id` nullable
- `workout_template_id` nullable
- `scheduled_date_local` nullable
- `name_snapshot`
- `status`: `planned`, `started`, `completed`, `skipped`, `cancelled`
- `notes` nullable

#### `programmed_session_exercises`
- common metadata
- `programmed_session_id`
- `exercise_id`
- `exercise_name_snapshot`
- `planned_order`
- `rotation_group_key` nullable
- `rotation_position` nullable
- `target_sets`
- `target_rep_min` nullable
- `target_rep_max` nullable
- `rest_seconds` nullable
- `tempo` nullable
- `technique_cue` nullable
- `notes` nullable

#### `programmed_session_sets`
- common metadata
- `programmed_session_exercise_id`
- `set_number`
- `set_role`
- `structure_type`
- `target_rep_min` nullable
- `target_rep_max` nullable
- `target_duration_seconds` nullable
- `target_load_kg` nullable
- `target_load_type`
- `failure_target`
- `notes` nullable

#### `programmed_set_components`
Same structured concept as `template_set_components`, snapshot at programme creation/import time.

### 6.7 Completed sessions

#### `completed_sessions`
Actual session header.

- common metadata
- `programmed_session_id` nullable
- `programme_block_id` nullable
- `workout_template_id_snapshot` nullable
- `legacy_workout_id` nullable, e.g. `W42`
- `session_name`
- `session_date_local`
- `timezone` nullable
- `status`: `in_progress`, `completed`, `abandoned`
- `started_at` nullable
- `completed_at` nullable
- `source_start_text` nullable
- `source_finish_text` nullable
- `duration_seconds` nullable
- `notes` nullable

#### `readiness_entries`
Optional one-to-one session readiness/recovery record.

- common metadata
- `completed_session_id`, unique
- `bodyweight_kg` nullable
- `sleep_duration_minutes` nullable
- `sleep_score` nullable
- `energy_pre` nullable
- `motivation_pre` nullable
- `soreness_score` nullable
- `soreness_notes` nullable
- `joint_issue_present` nullable
- `joint_issue_notes` nullable
- `pre_workout_nutrition` nullable
- `intra_workout_nutrition` nullable
- `intra_hydration_ml` nullable
- `post_workout_intake` nullable
- `session_fatigue` nullable
- `breathlessness` nullable
- `energy_stability` nullable
- `notes` nullable

Numeric readiness scales use their documented ranges and remain nullable. Nothing blocks workout start/completion.

#### `session_exercises`
Actual exercise occurrence within a completed session.

- common metadata
- `completed_session_id`
- `programmed_session_exercise_id` nullable
- `exercise_id`
- `exercise_name_snapshot`
- `planned_order` nullable
- `actual_order`
- `rotation_group_key` nullable
- `rotation_position` nullable
- target snapshot fields:
  - `target_sets` nullable
  - `target_rep_min` nullable
  - `target_rep_max` nullable
  - `rest_seconds` nullable
  - `tempo` nullable
  - `technique_cue` nullable
  - `programme_notes` nullable
- `started_at` nullable
- `completed_at` nullable
- `notes` nullable

`actual_order` preserves what happened even when equipment availability changes the exercise sequence.

#### `sets`
The fundamental historical training unit.

- common metadata
- `completed_session_id`
- `session_exercise_id`
- `exercise_id`
- `exercise_order_snapshot`
- `set_number`
- `set_role`: `warmup`, `work`
- `structure_type`: `straight`, `drop`, `rest_pause`, `myo_rep`, `partials`, `other`
- `load_kg` nullable
- `load_type`: `normal`, `assistance`, `band_plus_machine`, `bodyweight`, `other`, `unknown`
- `rep_mode`: `total`, `per_side`, `timed`, `mixed`
- `reps_as_recorded` nullable
- `primary_reps_completed` nullable
- `left_reps_completed` nullable
- `right_reps_completed` nullable
- `completed_reps` nullable
- `partial_reps` nullable
- `duration_seconds` nullable
- `failure_status`: `none`, `attempted_next_rep_failed`, `unknown_failure`
- `left_failure_status` nullable
- `right_failure_status` nullable
- `actual_rest_seconds` nullable
- `set_load_kg_reps` nullable, materialised/validated deterministic result
- `set_load_method` nullable
- `notes` nullable
- `completed_at` nullable
- `source_record_key` nullable, indexed unique where present

**Important:** `structure_type` and `failure_status` are independent. A drop set can end in failure.

#### `set_components`
Zero or more structured secondary components belonging to a set.

- common metadata
- `set_id`
- `sequence`
- `component_type`: `drop`, `rest_pause`, `myo_cluster`, `partials`, `other`
- `load_kg` nullable
- `load_type` nullable
- `reps_completed_full` nullable
- `reps_partial` nullable
- `duration_seconds` nullable
- `failure_status`
- `counts_toward_comparable_tonnage`
- `notes` nullable

Examples:
- `25 × 14 + 4 rest-pause`: primary set = 25 × 14; child component = rest-pause, same 25 kg, 4 full reps.
- `16 kg × 16 + 12 kg × 4 drop`: child component = drop, 12 kg, 4 full reps.
- `16 full + 8 partials`: child component = partials, 8 partial reps, `counts_toward_comparable_tonnage=false`.
- unquantified drop: structure remains `drop`; no invented child load/reps.

#### `exercise_metrics`
One-to-one with session exercise.

- common metadata
- `session_exercise_id`, unique
- `rpe` nullable
- `pump` nullable
- `form` nullable
- `where_felt_text` nullable
- `where_felt_tags` array, optional
- `legacy_tension` nullable
- `legacy_mmc` nullable
- `notes` nullable

Form interpretation:
- 9–10: strict/repeatable; progression may be valid
- 8: acceptable but imperfect; normally hold load
- 7 or below: execution degraded; load progression not justified

Historical Tension/MMC remain separate.

### 6.8 Coaching notes

#### `coaching_notes`
- common metadata
- `scope_type`: `programme`, `session`, `session_exercise`, `set`, `exercise`
- `scope_id`
- `author_type`: `user`, `coach`, `import`
- `note`
- `tags` array
- `created_at`

No AI decision is hidden in these notes. Imported or generated deterministic hints identify their origin.

### 6.9 Historical import and provenance

#### `import_batches`
- `id`
- `importer_type`
- `importer_version`
- `file_name`
- `file_sha256`
- `file_size_bytes`
- `started_at`
- `completed_at` nullable
- `status`: `previewed`, `committed`, `failed`, `cancelled`
- expected/detected counts
- `summary_json`

#### `import_records`
One source row / provenance record.

- `id`
- `import_batch_id`
- `source_sheet`
- `source_row_number`
- `source_record_key`
- `source_row_sha256`
- `entity_type`
- `entity_id`
- `raw_json`
- `data_status` nullable
- `source_text` nullable
- `imported_at`

This is the non-negotiable audit layer. A later normalisation or exercise rename never destroys what the spreadsheet originally said.

#### `import_issues`
- `id`
- `import_batch_id`
- `severity`: `info`, `warning`, `error`
- `code`
- `source_sheet` nullable
- `source_row_number` nullable
- `source_record_key` nullable
- `message`
- `raw_json` nullable
- `resolution_status`
- `resolved_at` nullable

### 6.10 Audit / deletion protection

#### `audit_events`
- `id`
- `entity_type`
- `entity_id`
- `action`: `create`, `update`, `soft_delete`, `restore`, `import`, `restore_backup`
- `before_json` nullable
- `after_json` nullable
- `reason` nullable
- `device_id`
- `created_at`

Historical records use soft delete. Permanent purge is a deliberately separate maintenance action.

### 6.11 Future sync scaffolding

#### `sync_outbox`
Written in the same transaction as local domain mutations.

- `id`
- `entity_type`
- `entity_id`
- `operation`: `upsert`, `delete`
- `revision`
- `payload_json`
- `created_at`
- `attempt_count`
- `last_attempt_at` nullable
- `synced_at` nullable

#### `sync_state`
- `provider`
- `remote_user_id` nullable
- `pull_cursor` nullable
- `last_pull_at` nullable
- `last_push_at` nullable
- `status`
- `error` nullable

No cloud provider is embedded in domain objects.

**Confidence: 0.96**

---

## 7. Core relationships

```text
programme_blocks
  ├── workout_templates
  │     ├── template_exercises
  │     │     └── template_sets
  │     │           └── template_set_components
  │     └── versions via template_family_id
  │
  └── programmed_sessions
        └── programmed_session_exercises
              └── programmed_session_sets
                    └── programmed_set_components

programmed_sessions
  └── completed_sessions (optional link)

completed_sessions
  ├── readiness_entries (0..1)
  ├── session_exercises
  │     ├── sets
  │     │     └── set_components
  │     └── exercise_metrics (0..1)
  └── coaching_notes

exercises
  ├── exercise_aliases
  ├── exercise_muscles
  ├── template_exercises
  ├── programmed_session_exercises
  └── session_exercises

import_batches
  ├── import_records
  └── import_issues

all mutable domain entities
  ├── audit_events
  └── sync_outbox
```

**Confidence: 0.98**

---

## 8. Set semantics and deterministic tonnage

### 8.1 Orthogonal dimensions

A set is described by independent dimensions:

1. **Role:** warm-up or work.
2. **Structure:** straight, drop, rest-pause, myo-rep, partials, other.
3. **Failure:** none / next attempted rep failed / unknown legacy failure.
4. **Load type:** normal, assistance, band+machine, bodyweight, other/unknown.
5. **Rep mode:** total, per-side, timed, mixed.

This prevents the historical `drop + failure` collision already present in the workbook.

### 8.2 Failure convention

`13F`:
- completed full reps = 13
- failure status = `attempted_next_rep_failed`
- failed attempted rep contributes zero reps and zero tonnage

Display remains `13F`.

### 8.3 Comparable kg-rep tonnage

For a quantifiable primary component:

```text
primary tonnage = load_kg × primary_completed_full_reps
```

For structured child components:

```text
component tonnage = component_load_kg × component_completed_full_reps
```

Comparable set tonnage:

```text
sum(primary + eligible child component tonnage)
```

Only components with known comparable resistance and full completed reps are eligible.

### 8.4 Exclusions

No normal comparable kg-rep tonnage for:
- assistance-load rows where assistance is not equivalent to lifted load;
- band augmentation where band contribution is unknown;
- unquantified drops;
- failed attempted reps;
- partial reps;
- timed holds.

Timed duration can be analysed separately later. Partials can have a separate count/trend later. They are not disguised as full-rep tonnage.

### 8.5 Historical compatibility examples

| Record | Stored representation | Comparable tonnage |
|---|---|---:|
| 25 kg × 14 + 4 RP | primary 14 + RP child 4 @25 | 450 |
| 16 kg ×16 + 12 kg ×4 drop | primary + drop child | 304 |
| 56 kg ×16 + 8 partials | primary 16 + partial child 8 | 896 |
| 17.5 kg ×20F (DS), drop unrecorded | primary 20, structure drop, failure true, no invented child | 350 |
| assistance pull-up | assistance load retained | null |
| machine 25 kg + band | load and band note retained | null |

**Confidence: 0.99**

---

## 9. Progression suggestion rules

Progression hints are deterministic support, not autonomous programming.

Hierarchy:

```text
Form → target-muscle sensation → reps → load
```

### 9.1 Default rule

1. If Form ≤ 7: do not recommend load progression.
2. If Form = 8: normally hold load and improve execution.
3. If Form ≥ 9: continue evaluation.
4. Target-muscle sensation must be acceptable from available structured evidence:
   - `Where Felt` target tags when present;
   - Pump and legacy fields can be displayed as evidence but are not magically converted into one synthetic score.
5. If rep target has not been achieved: prioritise reps at current load.
6. If upper rep target is achieved across the relevant prescribed sets with valid form and adequate target sensation: suggest the smallest sensible load increase.
7. If evidence is incomplete: return `insufficient_data`, not an invented coaching decision.
8. A suggestion never mutates the programme automatically.

### 9.2 Suggestion output

```text
HOLD LOAD
Reason: Form 8. Rep target achieved, but execution was not strict enough to justify load progression.
```

or:

```text
ADD REPS
Reason: Form 9. Target sensation acceptable. Upper rep target not yet achieved.
```

or:

```text
CONSIDER LOAD INCREASE
Reason: Form 9–10, target sensation acceptable, upper rep target achieved.
```

The wording remains advisory.

**Confidence: 0.91**

---

## 10. Live workout behaviour

### 10.1 Principle

One current exercise dominates the screen. The next required action must be visually obvious.

### 10.2 Current exercise card

Visible without opening menus:
- exercise name;
- pairing label e.g. A1;
- target sets/reps;
- tempo;
- technique cue;
- programmed rest;
- concise previous comparable performance;
- today's set history;
- current set controls.

### 10.3 Fast set entry

Primary workflow:
1. Load control
2. Reps control
3. Optional one-tap `F`
4. `COMPLETE SET`

Touch targets target at least ~48 CSS px, with larger primary actions.

Defaults:
- prefill load from programme/last comparable set where appropriate;
- do not prefill completed reps as though they happened;
- stepper buttons for common changes;
- direct numeric keypad entry available;
- failure button is obvious but not dangerously adjacent to destructive actions.

### 10.4 Immediate persistence

Every meaningful input mutation writes to IndexedDB. `COMPLETE SET` marks `completed_at` and triggers next-step logic. There is no session-wide Save button.

### 10.5 Previous performance

Show only high-value context:
- last comparable performance;
- best recent comparable result when useful;
- previous exercise score summary.

Charts stay out of the live set-entry surface.

**Confidence: 0.96**

---

## 11. A1/A2 and rotation groups

Programme exercises can share `rotation_group_key` and have a `rotation_position`.

Example:

```text
A1 Nautilus Biceps Curl
A2 Nautilus Triceps Extension
```

Default next-exercise algorithm:
- after A1 set 1 → A2 set 1;
- after A2 set 1 → A1 set 2;
- continue until prescribed work is complete;
- allow manual jump/reorder at any time;
- actual order is recorded separately from planned order.

Groups are generic and can support A1/A2/A3, B1/B2, etc.

**Confidence: 0.98**

---

## 12. Rest timer

Completing a set can automatically start the programmed rest timer.

Controls:
- Pause/Resume
- Reset
- +15 s
- +30 s
- Skip

Rules:
- timer never blocks set logging;
- user may open another exercise while it runs;
- target rest is stored from the programme snapshot;
- actual rest can be stored when meaningful;
- timer state uses absolute timestamps rather than trusting a decrementing JavaScript counter;
- backgrounding/locking the phone therefore does not make elapsed time drift;
- active workout update/reload never silently discards the timer state.

The service worker is not responsible for timing.

**Confidence: 0.94**

---

## 13. Exercise scoring and readiness

### 13.1 Exercise completion

Optional completion panel:
- RPE
- Pump
- Form
- Where Felt
- legacy fields are display/import fields, not required for new workouts
- notes

Where Felt v1:
- free text;
- optional muscle tags;
- no forced controlled vocabulary during a set.

### 13.2 Session readiness/recovery

Presented as an optional quick sheet before/after the workout. No field is mandatory.

The app must allow:
- start now;
- fill readiness later;
- leave fields blank permanently.

Unknown stays null.

**Confidence: 0.95**

---

## 14. Screen map and navigation

### 14.1 Mobile primary navigation

Bottom navigation:

```text
WORKOUT | PLAN | HISTORY | COACH | MORE
```

### 14.2 Workout

- Today / next programmed session
- Active session
- Start workout
- Optional readiness sheet
- Focused live workout logger
- Exercise completion score
- Session completion summary

### 14.3 Plan

- Current programme block / mesocycle
- Week/session list
- Workout templates
- Exercise library
- Exercise alias review
- Programme JSON import preview

### 14.4 History

- Chronological sessions
- Session detail
- Edit recording error
- Exercise history
- Progression/volume views after logger is mature

### 14.5 Coach

- Export current/today
- Export last 7 days
- Export exercise history
- Export mesocycle
- Export all
- Import programme JSON
- Human-readable session brief
- Machine-readable JSON
- CSV/XLSX where useful

### 14.6 More

- Historical spreadsheet import
- Import reports
- Backup
- Restore
- Settings
- Database diagnostics/schema version
- Sync status when added

### 14.7 Desktop

Same routes and domain logic, with a sidebar or wider layout. Live workout keeps the focused exercise-card model rather than turning into a spreadsheet just because a mouse exists.

**Confidence: 0.94**

---

## 15. Historical XLSX importer

### 15.1 Library

Use SheetJS CE 0.20.3 from the official SheetJS distribution. Vendor or lock the tarball so future installs do not depend on mutable third-party registry state.

### 15.2 Required sheets

- Set Data
- Session Summary
- Exercise Summary
- Data Audit
- README

Missing mandatory sheets fail preview.

### 15.3 Required Set Data columns

Exact required columns:

```text
Workout ID
Date
Day
Start
Finish
Exercise Order
Exercise
Set
Load (kg)
Load Type
Set Type
Reps as Recorded
Primary Reps
Secondary Load (kg)
Secondary Reps
Completed Reps
Failure
RPE
Pump
Form
Legacy Tension
Legacy MMC
Set Load (kg-reps)
Set Load Method
Notes
Data Status
Source
```

### 15.4 Preview gate

Before commit display:
- file name/hash;
- sessions detected;
- session-exercise groups detected;
- sets detected;
- exact exercise labels;
- alias candidates;
- warnings/errors;
- duplicate/re-import counts;
- changed-key conflicts.

For the current canonical workbook, the golden expected values are:
- 50 sessions
- 403 session-exercise groups
- 1,323 sets
- 146 exact exercise labels

A deviation is not automatically an error, but it is clearly reported.

### 15.5 Import transaction

The commit is transactional:
1. create import batch;
2. create exact exercise definitions as required;
3. create sessions/session exercises;
4. create sets/components;
5. create exercise metrics;
6. write raw provenance rows;
7. reconcile counts/summary;
8. commit together.

A validation failure prevents partial commit.

### 15.6 Historical Set Type translation

Import translator maps workbook values without losing source:
- `straight` → structure straight
- `failure` → structure straight + failure status
- `drop` → structure drop
- `drop-unquantified` → structure drop, no invented child
- `rest-pause` → structure rest_pause
- `partials` → structure partials

Independent workbook `Failure=1` always sets failure status, even when structure is drop.

Original Set Type remains in raw provenance.

### 15.7 Exercise-name policy

No fuzzy auto-merge.

Case-only and close-label candidates are presented in a later review workflow. If definitions are later merged:
- historical `exercise_name_snapshot` is unchanged;
- raw source is unchanged;
- the canonical `exercise_id` reference may be migrated with an audit event.

**Confidence: 0.99**

---

## 16. Coach Bridge export contract

Canonical machine-readable export is JSON. CSV/XLSX are convenience representations.

### 16.1 Export scopes

- active/current workout
- today
- last 7 days
- arbitrary date range
- one exercise history
- current programme block
- full training database

### 16.2 JSON rules

- `format` and `schema_version` are mandatory
- unknown historical values are explicit `null`
- stable IDs are included
- name snapshots are included
- set components remain structured
- provenance is optional by scope but always available in full export
- calculated comparable tonnage includes method/status
- exports are deterministic enough for tests and coach ingestion

The normative schema is supplied as:
`project-freak-training-export-v1.schema.json`

### 16.3 Human-readable export

A concise Markdown/text session brief contains:
- readiness if recorded;
- exercise order;
- target vs actual;
- all sets in readable notation;
- RPE/Pump/Form/Where Felt;
- session totals where comparable;
- notes;
- explicit unknowns.

It is designed to paste directly into ChatGPT without re-explaining the notation.

**Confidence: 0.96**

---

## 17. Programme JSON import contract

The normative schema is:
`project-freak-programme-import-v1.schema.json`

### 17.1 Validation approach

The source-of-truth runtime schema is authored in Zod and exported to JSON Schema Draft 2020-12.

### 17.2 Import rules

- exact `schema_version` is required;
- every referenced exercise ID must exist;
- exercise name snapshot must not contradict the selected ID;
- set numbers must be positive and unique within the exercise;
- target ranges must be logically valid;
- loads/reps/rest cannot be negative;
- pairing groups must be internally coherent;
- intensifier components must match allowed structures;
- malformed payload rejects the whole import;
- preview shows the complete proposed change;
- commit happens in one transaction;
- no partial programme is left behind after failure.

### 17.3 Exercise creation

Programme import v1 **does not create new exercise definitions implicitly**. Unknown exercise IDs are rejected and shown in preview. Exercise-library import can be added separately later.

This prevents a typo from creating `Nautilus Bicpes Curl` and making everyone pretend that was the plan.

**Confidence: 0.97**

---

## 18. Backup and restore

### 18.1 Backup format

Full backup:
`project-freak-backup-v1.schema.json`

Contains:
- backup format/version;
- app version;
- database schema version;
- exported timestamp;
- device metadata;
- all non-ephemeral database tables;
- checksums;
- optional import provenance/audit data.

### 18.2 Restore sequence

1. Read file.
2. Validate format/schema.
3. Validate checksums.
4. Show counts/dates/source.
5. Run migration in staging representation if needed.
6. Show destructive confirmation.
7. Replace/merge according to explicit selected restore mode.
8. Verify record counts and invariants.
9. Write audit event.

### 18.3 Destructive actions

- normal delete = soft delete;
- restore available from history/audit where practical;
- permanent purge is separate and explicit;
- historical import provenance is not silently purged by ordinary record editing.

**Confidence: 0.96**

---

## 19. Offline/PWA strategy

### 19.1 App shell

Use `vite-plugin-pwa` with a custom `injectManifest` service worker.

Precache:
- HTML shell;
- compiled JS/CSS;
- fonts/icons owned by the project;
- static app assets.

Runtime network content is not required for core logging.

### 19.2 Data

All workout data lives in IndexedDB through Dexie.

No network required for:
- start workout;
- create/edit set;
- rest timer;
- finish exercise/session;
- history;
- programme data already stored locally;
- export/backup generation.

### 19.3 Storage persistence

On supported browsers:
- inspect `navigator.storage.persisted()`;
- request `navigator.storage.persist()` at an appropriate user-visible moment;
- handle refusal gracefully;
- always handle `QuotaExceededError`;
- expose storage health in diagnostics.

### 19.4 Update policy

Do not auto-reload an active workout when a new service worker is available.

Instead:
- show unobtrusive update available state;
- apply after session completion or explicit user action;
- migrations run on next safe application start.

### 19.5 Installed iPhone PWA storage identity

The installed Home Screen app is treated as its own storage context. Historical import should be performed inside the installed PWA used for training rather than assuming data entered in a Safari tab will appear in the Home Screen installation.

**Confidence: 0.95**

---

## 20. Safari vs Chrome recommendation

### iPhone

**Use Safari as the reference browser and install PROJECT FREAK to the iPhone Home Screen.**

Reasons:
- iOS 26 Home Screen sites open as web apps by default;
- Safari/WebKit provides the canonical PWA behaviour we must support on iPhone;
- in the UK, Chrome on iPhone does not currently give PROJECT FREAK a fundamentally different browser engine that solves PWA/IndexedDB concerns;
- the installed Home Screen PWA is the actual training target, not a perpetually open browser tab.

Chrome on iPhone can still be tested, but it is not the preferred training install.

### Windows

**Use Chrome or Edge** for normal desktop use and development. Both provide strong devtools and mature PWA/IndexedDB behaviour.

### Acceptance browser matrix

- Physical iPhone: current iOS Safari, installed Home Screen PWA
- Windows 11: current Chrome
- Windows 11: current Edge
- Automated: Playwright Chromium + WebKit
- Physical iPhone remains mandatory because desktop WebKit automation is not a perfect substitute for real iOS behaviour.

**Confidence: 0.96**

---

## 21. Future sync strategy

### 21.1 What is locked now

Every syncable record has:
- globally unique ID;
- revision;
- created/updated/deleted timestamps;
- device ID;
- soft-delete tombstone;
- mutation entry in an outbox.

Local writes succeed first. Sync is asynchronous later.

### 21.2 Provider boundary

Define:

```text
SyncProvider
  push(changes)
  pull(cursor)
  resolveIdentity()
  health()
```

No React component imports a provider SDK directly.

### 21.3 Conflict strategy

Initial intended model:
- single human owner;
- entity-level revisions;
- field-safe merges only where deterministic;
- otherwise latest accepted version plus explicit conflict record;
- completed set actuals never silently overwritten by a cloud pull;
- deletes are tombstones, not immediate hard deletions.

### 21.4 Provider choice

Do **not** lock the vendor in Specification v1.0.

Two credible future implementations:
- Dexie Cloud: shortest path from Dexie to local-first sync;
- Supabase/Postgres: more backend ownership/portability, but more custom sync engineering.

The architectural requirement is that either can be added without changing live-workout components or historical domain structures.

### 21.5 Important limitation before sync exists

Until cloud sync is implemented, the iPhone and Windows installations have separate local databases. Full backup/export is the supported disaster-recovery and manual transfer mechanism.

**Confidence: 0.90**

---

## 22. Project/folder structure

```text
project-freak/
├─ docs/
│  ├─ SPECIFICATION_v1.0.md
│  ├─ adr/
│  └─ schemas/
├─ public/
│  ├─ icons/
│  └─ static/
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ routes.tsx
│  │  ├─ providers/
│  │  └─ layout/
│  ├─ domain/
│  │  ├─ models/
│  │  ├─ enums/
│  │  ├─ rules/
│  │  │  ├─ tonnage.ts
│  │  │  ├─ progression.ts
│  │  │  └─ pairing.ts
│  │  └─ validation/
│  ├─ application/
│  │  ├─ workout/
│  │  ├─ programme/
│  │  ├─ history/
│  │  ├─ import/
│  │  ├─ export/
│  │  └─ backup/
│  ├─ data/
│  │  ├─ db/
│  │  │  ├─ ProjectFreakDb.ts
│  │  │  ├─ schema/
│  │  │  └─ migrations/
│  │  ├─ repositories/
│  │  ├─ dexie/
│  │  └─ sync/
│  ├─ features/
│  │  ├─ workout/
│  │  ├─ plan/
│  │  ├─ exercises/
│  │  ├─ history/
│  │  ├─ coach/
│  │  ├─ imports/
│  │  ├─ backup/
│  │  └─ settings/
│  ├─ components/
│  │  └─ ui/
│  ├─ schemas/
│  │  ├─ programmeImport.ts
│  │  ├─ trainingExport.ts
│  │  └─ backup.ts
│  ├─ importers/
│  │  └─ historicalXlsx/
│  ├─ exporters/
│  ├─ pwa/
│  │  └─ sw.ts
│  ├─ utils/
│  └─ test/
├─ tests/
│  ├─ fixtures/
│  ├─ integration/
│  └─ e2e/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
└─ README.md
```

Feature code can import application/domain interfaces, not Dexie internals.

**Confidence: 0.96**

---

## 23. Test strategy

### 23.1 Domain unit tests

Mandatory cases:
- 13F counts 13, never 14;
- straight failure;
- drop + failure;
- quantified drop tonnage;
- rest-pause tonnage;
- partial exclusion;
- assistance exclusion;
- band+machine exclusion;
- unquantified drop does not invent work;
- timed hold remains non-tonnage;
- per-side totals;
- Form progression gates;
- missing sensation evidence returns insufficient data;
- A1/A2 sequencing.

### 23.2 Repository/integration tests

Using fake IndexedDB:
- create/read/update;
- transaction rollback;
- immediate autosave;
- soft delete/restore;
- migration from every prior schema fixture;
- sync outbox written in same transaction;
- import idempotency;
- import conflict detection;
- backup round-trip.

### 23.3 Golden historical workbook test

The canonical workbook is a golden fixture.

Expected:
- SHA-256 matches approved fixture;
- 50 sessions;
- 403 session-exercise groups;
- 1,323 sets;
- 146 exact exercise labels;
- zero duplicate recommended source keys;
- known edge rows match exact expected normalised representation;
- no nonblank source value disappears without a documented transformation;
- no blank source metric becomes invented numeric data.

### 23.4 Component tests

- touch set entry;
- failure toggle;
- load/reps steppers;
- score panel;
- import preview;
- restore confirmation;
- timer controls.

### 23.5 E2E

Automate:
- installable build boot;
- offline start;
- create session;
- log sets;
- alternate A1/A2;
- background-ish timer state;
- finish session;
- history read/edit;
- programme import;
- export;
- backup/restore.

### 23.6 Manual physical iPhone acceptance

Required for each logger milestone:
- installed Home Screen launch;
- one-handed touch targets;
- numeric keypad behaviour;
- screen lock/background;
- offline;
- service-worker update;
- rotation/orientation where supported;
- data still present after browser/app restart.

**Confidence: 0.97**

---

## 24. Implementation milestones and exit gates

| Phase | Deliverable | Must pass before advancing |
|---:|---|---|
| 0 | Specification v1.0 | Data model/rules internally consistent; expensive decisions locked |
| 1 | Project skeleton | React/Vite/TS build, routing, CSS tokens, tests, PWA manifest, lint/typecheck/build all pass |
| 2 | Persistence foundation | Dexie schema v1, repositories, UUID/meta/audit/outbox, migration harness, repository tests |
| 3 | Historical XLSX importer | Preview + validation + idempotent transactional import; canonical workbook exact count/edge tests pass |
| 4 | Exercise library | Browse/search/archive; exact historical labels preserved; alias candidate review without silent merge |
| 5 | Programme model | Blocks/templates/programmed snapshots; versioning; programme JSON validation + preview + atomic import |
| 6 | Live logger core | Start session, current exercise, large load/reps controls, failure, complete set, autosave, recovery after restart |
| 7 | Pairing + rest | A1/A2 rotation, manual jump, rest auto-start/pause/reset/+15/+30/skip, actual rest capture |
| 8 | Scoring/readiness/completion | RPE/Pump/Form/Where Felt; optional readiness; finish session; no required optional fields |
| 9 | History + safe edits | Session browse/detail, exercise history, edit errors, soft delete, audit trail |
| 10 | Progression views | Previous comparable performance + deterministic Project Freak hint rules; no auto-programme mutation |
| 11 | Coach Bridge | JSON/Markdown/CSV/XLSX exports; all requested scopes; programme import workflow complete |
| 12 | Backup/restore | Full backup, validation, preview, restore, duplicate protection, round-trip tests |
| 13 | Offline/PWA hardening | Installed iPhone PWA, offline full session, persistent storage request, safe update flow |
| 14 | Sync contract | Provider interface, outbox/conflict tests; actual provider remains optional |
| 15 | Analysis dashboards | Weekly direct sets, exercise progression, volume/frequency/failure/Form/RPE trends only after logger acceptance |
| 16 | Polish | Performance, accessibility, keyboard/desktop ergonomics, touch refinement, visual identity |

No phase is considered complete because the page exists. The exit gate must pass.

**Confidence: 0.97**

---

## 25. Final product acceptance criteria

PROJECT FREAK v1 core is accepted only when all of the following are true:

### Data integrity
- Canonical workbook imports without lost or fabricated values.
- Reimport cannot silently duplicate history.
- Raw provenance remains retrievable.
- Failure and set structure are independent.
- Special components retain their structure.
- Historical actuals are not rewritten by future programme edits.
- Schema migration tests pass.
- Backup restore reproduces the database.

### Gym logging
- Normal set can be logged with load, reps, optional failure and one completion action.
- No mandatory keyboard-heavy workflow.
- Current exercise/next action obvious.
- A1/A2 flow does not require manually reopening exercises each set.
- Timer never blocks logging.
- App survives reload/restart without losing already entered meaningful actions.

### Offline
- After installation/first load, a full workout can be started, logged, edited, completed and reviewed with network disabled.
- Historical and programme data already local remain available.
- Update handling cannot unexpectedly reload an active workout.

### History/coaching
- Any session can be reconstructed exactly enough to audit its sets/components.
- Exercise history is queryable.
- RPE/Pump/Form/Where Felt and legacy metrics are preserved correctly.
- Coach export is useful without manual reformatting.
- Programme import rejects malformed data before mutation.

### Cross-platform
- Physical iPhone Home Screen PWA is usable one-handed in the gym.
- Windows Chrome/Edge experience is complete.
- No platform requires a separate native codebase.

### Safety of destructive operations
- Historical edit/delete requires explicit action.
- Delete is soft by default.
- Restore/backup/destructive replace has preview and confirmation.

**Confidence: 0.98**

---

## 26. Architectural decisions that are expensive to change later

These are **LOCKED for v1.0** unless a concrete implementation test disproves them.

| Decision | Why it is expensive later |
|---|---|
| Separate exercise definitions, templates, programmed snapshots and completed actuals | Collapsing them would make future programme edits corrupt history |
| Set structure and failure are independent | Existing history already proves they can coexist |
| Secondary/intensifier work uses child set components | Fixed `secondary_load/reps` columns cannot scale to multiple drops/myo clusters cleanly |
| Stable client UUIDs + revisions + tombstones from day one | Retrofitting identity for sync is painful and error-prone |
| Raw import provenance is permanent | Once source evidence is discarded it cannot be reconstructed |
| Historical name snapshots are immutable | Library renames must not rewrite what was recorded |
| Planned order and actual order are separate | Gym equipment availability routinely changes actual sequence |
| Templates are versioned/snapshotted | Mutable templates otherwise rewrite the meaning of old programmed sessions |
| JSON contracts are versioned | Coach/import/backup compatibility depends on it |
| Unknown is `null`, not zero/default | Analysis must distinguish absent evidence from an actual value |
| Historical local times are not converted without known timezone | Fabricated timestamp precision is worse than explicit uncertainty |
| Installed PWA is treated as its own local data store | Safari-tab storage must not be assumed to migrate to the Home Screen app |
| UI accesses repositories/use cases, not Dexie directly | This is the seam that makes future sync/provider replacement feasible |

**Confidence: 0.99**

---

## 27. Decisions intentionally deferred because they are cheap to change

- exact colour palette and visual branding;
- final icon set;
- static hosting provider;
- cloud sync vendor;
- dashboard chart library;
- whether Where Felt tags become a stricter muscle vocabulary;
- optional haptics/sound behaviour;
- exact desktop sidebar widths.

These should not delay the data/logging foundation.

**Confidence: 0.96**

---

## 28. Known unknowns / uncertainty

1. **Exercise canonicalisation.** The workbook has 146 exact names and 27 case-only duplicate groups. It is unsafe to infer all mappings automatically. The v1 importer preserves exact labels and creates review candidates.
2. **Historical timezone.** Some sessions may have occurred outside the UK. We will not infer UTC timestamps from local clock text.
3. **Target-muscle sensation threshold.** Form rules are defined, but the precise deterministic threshold combining Where Felt/Pump for a load-increase hint should be validated against real use rather than pretending one invented score is physiology.
4. **Future sync provider.** The architecture is ready; the vendor is intentionally not locked.
5. **iOS background timing edge behaviour.** Absolute timestamps make the timer robust, but physical-iPhone testing remains part of acceptance.
6. **Hosting.** Any static HTTPS host works initially; it is not architecturally significant.
7. **Historical split notation.** Strings such as `6+2` remain verbatim unless the source explicitly proves the split structure.

**Weighted confidence in Specification v1.0: 96%**

---

## 29. The question that matters next but was not in the brief

**What is the acceptable data-loss window before cloud sync exists?**

Local-first protects workouts from bad gym connectivity, but it does not protect against a lost/damaged iPhone. Before multi-device sync exists, backup/restore is the disaster-recovery system.

Specification v1.0 therefore treats full backup/restore as a core phase, not polish. The recommended operational target before cloud sync is:
- full backup immediately after the canonical historical import;
- one-tap full backup available at all times;
- backup reminder after a configurable number of completed sessions;
- do not rely on browser/PWA storage as the only copy of irreplaceable history.

That is the boring bit that prevents months of training data being sacrificed to the ancient human ritual of dropping a phone into something wet.

**Confidence: 0.98**

---

# Specification lock statement

This document is **PROJECT FREAK Web App Specification v1.0**.

Implementation should proceed against this model. Changes to the locked architectural decisions require:
1. a concrete reason;
2. impact analysis;
3. migration implications;
4. an explicit specification revision.

Cosmetic and low-cost implementation details may evolve without reopening the architecture.
