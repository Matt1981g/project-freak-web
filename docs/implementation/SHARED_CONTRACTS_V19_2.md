# PROJECT FREAK — shared contract decisions for packages 2–6

**Status:** Design baseline for workflow package 2, 11 October 2026. Contract intentions in this file are not evidence that the backend, local database, restore, or UI implementation has landed.

## Version and compatibility

- The canonical frontend release number comes from root `package.json`; `src/release.ts` presents its `Vmajor.minor` label and the injected Git commit SHA. Display, Coach export, backup and deployed verifier must agree on this number. The npm package and lockfile carry the same version.
- Release number is **not** data schema compatibility. Current local IndexedDB schema is 3, data contract 1.1.0, Coach export format 1.0.0, and cloud RPC contract 1.0.0. These advance independently and require explicit compatibility tests.
- Current Coach v1 exporter includes per-set RPE and optional exercise enjoyment. Both may be null for older/absent records. The published JSON schema now describes these fields; absence must not be backfilled as a zero.
- Record old-client compatibility before any backend migration. A retired client must retain its offline mutations for export/recovery even if cloud writes become version-gated.

## Data ownership and identity — intended invariants

1. A local dataset belongs to the exact project origin plus authenticated account, or to an explicitly unlinked offline profile. Different accounts must not see each other's outbox, records, auth, cursors or conflict evidence.
2. Legacy offline records are linked by an explicit user action; merely signing in never silently merges or uploads them. Signing out leaves the owner's offline data intact but removes its accessibility to another signed-in account.
3. Repository operations that compare revisions, check pending mutations and apply remote records are transactional. Mutations return `applied`, `verified_duplicate`, `retained_conflict`, `quarantined` or `retryable_failure` and issue committed-change notifications only for successful commits.
4. A cross-tab, account-scoped coordination lock covers sync, refresh and exclusive restore; every writer respects maintenance exclusion. A JavaScript promise shared within one tab is insufficient.
5. A pull cursor advances only after each incoming record was applied, verified redundant, or durably recorded for recovery. Dependent children stage until a parent can be resolved. Stale competing snapshots cannot be silently discarded.

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

- **Production recovery:** obtain a stable phone/PC backup with other writers paused and *verify a restore* in a distinct browser profile. Git commit history does not meet this gate.
- **Staging:** create isolated Supabase project and nonpersonal fixtures for account-switch, interleaved writes, failure injection, migrations and two-device sync. Only production PF and unrelated Chantastic projects currently appear in connected Supabase scope.
- **Hosting/auth entitlement:** decide HTTP `frame-ancestors` response-header hosting route and leaked-password protection plan availability; unsupported protections remain explicitly open.
- **Device & private data:** test physical iPhone portrait/landscape and resume; separately test the private historical workbook when provided. Do not pass synthetic fixtures off as those demonstrations.
- This design record does not authorise an IndexedDB or backend deployment. Implement and verify package 3 before rewiring workout and Coach consumers.
