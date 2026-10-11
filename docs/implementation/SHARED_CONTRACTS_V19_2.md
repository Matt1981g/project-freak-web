# PROJECT FREAK — shared contract decisions for packages 2–6

**Status:** Design baseline for workflow package 2, 11 October 2026. Contract intentions in this file are not evidence that the backend, local database, restore, or UI implementation has landed.

## Version and compatibility

- The canonical frontend release number comes from root `package.json`; `src/release.ts` presents its `Vmajor.minor` label and the injected Git commit SHA. Display, Coach export, backup and deployed verifier must agree on this number. The npm package and lockfile carry the same version.
- Release number is **not** data schema compatibility. Current local IndexedDB schema is 3, data contract 1.1.0, Coach export format 2.0.0 (published in `docs/schemas/project-freak-training-export-v2.schema.json`), legacy Coach schema v1.0.0, and cloud RPC contract 1.0.0. These advance independently and require explicit compatibility tests.
- Current Coach **v2** exporter includes per-set RPE and optional exercise enjoyment. Both may be null for older/absent records. Current and legacy schemas separately describe these fields; absence must not be backfilled as a zero. The existing v1 schema remains available for supported legacy files, and its `schema_version` must not be relabelled to 2.0.0.
- Record old-client compatibility before any backend migration. A retired client must retain its offline mutations for export/recovery even if cloud writes become version-gated.

**Schema validation gap:** CI tests now ensure the producer version and separate v1/v2 schema declarations agree. Full runtime validation of representative generated v2 exports against the published JSON Schema is still outstanding and is a package-2 completion gate, not implied by these version checks.

## Data ownership and identity — intended invariants

1. A local dataset belongs to the exact project origin plus authenticated account, or to an explicitly unlinked offline profile. Different accounts must not see each other's outbox, records, auth, cursors or conflict evidence.
2. Legacy offline records are linked by an explicit user action; merely signing in never silently merges or uploads them. Signing out leaves the owner's offline data intact but removes its accessibility to another signed-in account.
3. Repository operations that compare revisions, check pending mutations and apply remote records are transactional. Mutations return `applied`, `verified_duplicate`, `retained_conflict`, `quarantined` or `retryable_failure` and issue committed-change notifications only for successful commits.
4. A cross-tab, account-scoped coordination lock covers sync, refresh and exclusive restore; every writer respects maintenance exclusion. A JavaScript promise shared within one tab is insufficient.
5. A pull cursor advances only after each incoming record was applied, verified redundant, or durably recorded for recovery. Dependent children stage until a parent can be resolved. Stale competing snapshots cannot be silently discarded.

## Account/project ownership gate — Package 3 incremental implementation

- `src/application/sync/datasetIdentity.ts` now stores a **device-only dataset binding** in the existing IndexedDB `settings` table, preserving backup compatibility and avoiding an unfinished database migration. The binding contains the canonical HTTPS project origin, authenticated Supabase user ID and linking timestamp; **never** tokens or service-role credentials.
- A dataset with no binding **cannot push or pull**. After checking the authenticated backend, the user must deliberately confirm **LINK THIS DATASET** on the Cloud Sync screen. This is a potentially one-time upgrade step on each previously used browser profile, including the live PC and iPhone when eventually deployed. Existing offline workout records are not purged or relabelled.
- The first link is serialized across tabs; an existing binding cannot be reassigned to another user or project. A conflicting legacy `sync_state.remote_user_id` also blocks automatic linking. Sign-in precommit validation rejects a different owner **before** replacing the stored login; refresh rejects a changed user ID. Sync RPC requests pin the expected user and validate provider response identities.
- **Unfinished:** this is a cloud I/O guard for a **single-owner local database**, not full account-scoped storage or UI privacy. Signing out currently does not hide this owner's offline workout screens from an unauthenticated person using the same browser profile. Full account-scoped storage and visibility, cross-tab maintenance lock, and explicit migration/recovery UX remain hard release gates. Never describe the one-way link button alone as complete multi-account isolation.

## Cross-tab operation lock — Package 3 incremental implementation

- `src/application/sync/datasetOperationLock.ts` uses an origin-wide browser **Web Lock** named after the local database. The operation is exclusive and non-queuing: when another tab is syncing, login/logout, project configuration, linking and restore reject with a retryable error instead of interleaving network responses or changing the dataset under an active operation.
- Lock acquisition covers all asynchronous cloud push/pull batches and the complete restore/rollback promise. Auth configuration changes, sign-in/up/out and the initial account link use the same lock. A denied lock does not mutate the dataset.
- **Unsupported Web Locks fail closed** for these operations. Browser E2E tests on Chromium/WebKit verify origin-wide exclusion. On unsupported browsers, do not deploy until an explicitly designed alternative is available; no silent unsafe fallback.
- **Still outstanding:** workout logging and all arbitrary local record writes do not yet participate in the maintenance lock. Other tabs might therefore edit the local database during restoration. A whole-app read-only maintenance mode and/or cross-tab active-editor detection is required before describing destructive restoration as safe under concurrent workout logging.
- Database snapshots remain read-transaction-consistent independently of this lock. No changes to the production Supabase project are made by these tests.

## App-lifetime maintenance protection — Package 3 incremental implementation

- Every loaded PF tab obtains a **shared app-lifetime Web Lock** before mounting the application routes. It stays held while workout logging, history editing, programme import and other UI operations remain available. Routine cloud sync has a **different lock**, so early-morning workouts are not blocked by unrelated synchronisation.
- A destructive **Restore Backup** first obtains the cloud-operation mutex, pauses and makes the current app UI inert, releases its own shared lease, and attempts a **non-queuing exclusive app lease**. Any other open PF tab holding a shared lease makes the restore fail **before replacement or rollback starts**. Other newly opened PF tabs wait to load their routes until the restore releases the exclusive lease. The original UI is unpaused on both success and failure.
- On browsers without Web Locks, normal offline logging remains available, but destructive restore refuses rather than risking mixed data. This does not alter the backup JSON format, IndexedDB schema or cloud RPC contract.
- If the browser suspends/releases a tab's shared lease, the gate retries acquisition when the page becomes visible, focused or receives `pageshow`. Offline workout logging is not gated by a password prompt.
- **Remaining acceptance work:** pending work launched asynchronously before the UI is paused must be audited (especially programme import and background write tasks); not every bare repository write currently acquires a maintenance lease. Two-device iPhone/desktop testing and offline re-entry remain required before a production release. Account visibility after sign-out also remains open.

## Graph, drafts and coaching — intended invariants

- Set completion, workout finalisation and programme replacement commit related entities, revisions, audit and outbox as one graph operation. Idempotent retries never create duplicates.
- Draft inputs have a monotonically increasing generation; only persistence of the latest complete generation can clear dirty state. Route changes, Finish, Coach export and PWA update request a durable flush; a failed flush leaves a recoverable local draft. Local saved and remote synced are separate statuses.
- Progressive overload uses one policy for advice and automatic changes. Form → stimulus → reps → load; missing evidence means HOLD/REVIEW. Coach baseline and user overrides remain protected. Apply once after finalisation with durable feedback; a later correction requests a review rather than looping rewrites. Enjoyment is advisory.
- Programme replacement uses deliberate prescription identity/supersedes lineage and graph completeness. A partial newer block cannot hide a valid prior one. Import preview binds catalogue/gym revision and revalidates at atomic commit.

## Caches, change notifications, retention

- Typed committed-change notifications request coalesced sync and targeted cache/analysis invalidation. Failed or rolled-back writes do not notify success.
- PWA cache ownership is confined to PF shell assets; review images have workout-content fingerprints and must update after local or remote corrections. Unrelated apps/caches may not be purged.
- Never prune pending outbox entries, required tombstones, unresolved conflicts/quarantine, or evidence required for restoring an offline client. Retention periods will be measured against full-history fixtures, not guessed.

## External gates still open

- **Production recovery:** phone/PC backup files have been downloaded by the owner; a checksum/restore verification in a separate browser profile is still required. Git commit history does not meet this gate.
- **Database testing (no paid branch):** Supabase rejected a temporary branch because the connected organization is on Free (branching requires Pro). Instead, `.github/workflows/db-contract-ci.yml` creates a disposable PostgreSQL 17 container, loads `docs/sync/project-freak-supabase-v1.sql`, and runs synthetic smoke tests from `tests/sql/` for unauthenticated rejection, cross-user isolation, equal-revision conflict convergence and RPC role privileges. This database vanishes after each GitHub Actions run; it incurs no ongoing database subscription. It is **not** a full hosted Supabase staging project: real Supabase Auth, API-gateway behaviour, two-browser convergence, network failures and migration parity still need separate validation. Production and Chantastic are never used as staging.
- **Hosting/auth entitlement:** decide HTTP `frame-ancestors` response-header hosting route and leaked-password protection plan availability; unsupported protections remain explicitly open.
- **Device & private data:** test physical iPhone portrait/landscape and resume; separately test the private historical workbook when provided. Do not pass synthetic fixtures off as those demonstrations.
- This design record does not authorise an IndexedDB or backend deployment. Implement and verify package 3 before rewiring workout and Coach consumers.
