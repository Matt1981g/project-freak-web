# Old School reset — implementation and release status

## Draft behavior

- Old School is the default interface; Analytics retains the existing workout and feedback screens. Both call the same persistence services.
- The compact screen reuses the existing durable set logger, advances to the next set, rotates programmed pairs, and records pump/enjoyment per exercise. No rest timer, readiness panel, daily modal or post-workout questionnaire is mounted in this mode.
- Historical starting suggestions use stable IDs/approved aliases and conservative normalized names. Same free-weight movement carries between gyms. Unverified machine transfers and older history are amber suggestions, distinct from verified progression evidence.
- Intensity is captured in new session notes and derived consistently on resume. Normal, FREAK and Recovery alter set prescriptions; Recovery reduces load and failure exposure. Existing sessions and completed actuals are not rewritten.
- Coach Bridge instructions now request balanced hypertrophy, Super Saturday legs, gradual volume rebuilding, restrictions and session limits. This changes future coaching instructions; it does not itself generate or replace an already imported weekly programme.
- Missing Form is not fabricated. Repeated comparable rep/RPE/pump evidence can support a limited progression suggestion; verified Form-based Analytics logic remains available.
- Backup validation accepts existing `sync_conflict` audit events so conflict evidence can be preserved in a backup.

## Verification

Local typecheck and production build pass. Lint has no errors and three pre-existing hook warnings. Automated suite: 466 passing, one fixture-dependent skip. New unit cases cover cross-gym dumbbells, missing gym metadata, uncertain machine loads, stale/future history, intensity prescriptions and sync-conflict backup validation. Added mobile-sized browser flow for save, interruption recovery, mode switching and absence of timers. Existing browser tests explicitly select Analytics.

Local Playwright browser installation failed because downloaded browser archives were invalid. Browser checks must complete through the unchanged repository CI before any publication. No browser success is claimed.

## Release blockers

A full cloud-entity snapshot was exported with unchanged before/after database checksum. The existing app's isolated restore correctly rejects pre-existing duplicate set-number groups. Some duplicates contain different completed values. They must not be silently discarded. No production record has been modified, and no migration is included.

A verified recovery copy covering these conflicts (and device-only unsynced work), required staging checks from RELEASE_CONTROLS.md, browser verification, and a final programming review are still required. This is a draft and must not be merged or deployed until those gates pass. Do not weaken restore validation to force this release through.

## Programming evidence

The defaults are product choices, not claimed universal optima. Volume has diminishing returns and should be increased according to individual response; frequency helps distribute recoverable work. Closer-to-failure work can support hypertrophy, with uncertainty about an exact optimum. Sources reviewed:

- https://pubmed.ncbi.nlm.nih.gov/41343037/
- https://pubmed.ncbi.nlm.nih.gov/38970765/

## Known work remaining

- Confirm the selected intensity and generated weekly plan meet balanced coverage, session-time and recent-fatigue constraints end to end; do not equate a set-count cap with a complete fatigue model.
- Validate mobile layout and live authenticated Supabase synchronization; public build checks alone do not prove either.
- Resolve historical duplicate records through a reversible, audited reconciliation before claiming a restorable personal-data backup.
