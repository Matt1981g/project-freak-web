# Exercise Intelligence validation

The library audit validates required fields, allowed values, confidence/status agreement,
unclassified movement/family/length bias, repeated or overlapping muscle roles,
category fallbacks, pending variants, and same-name duplicate candidates within the
same equipment/gym context. Duplicate candidates with conflicting intelligence are
reported separately. These checks also inspect confirmed records without replacing
their metadata or changing their confirmation status.

Family names are free text in the current model, not foreign keys. The audit detects
empty/placeholder families and conflicting duplicate definitions; it cannot certify
that every free-text family is biomechanically correct. A null handle is legitimate
for many exercises and is not universally treated as missing metadata.

Library Integrity displays the detailed findings. A zero-length confirmation queue
does not display a completion claim while validation findings remain. Structurally
valid records with unresolved classification can be corrected in the review cards.
Malformed records are reported in Library Integrity instead of silently overwritten.

The existing library backfill still runs, preserves verified/user-confirmed and exact
legacy mappings, and now applies ambiguity policy before choosing a replacement.
Repeated audits no longer promote and downgrade the same ambiguous record on every
page load. No audit merges/deletes IDs or changes workout history.
Automatic high-confidence proposals also have redundant muscle-role labels removed,
retaining the primary role first. This cleanup does not touch verified,
user-confirmed or pending-review records and is idempotent.

## Read-only export audit

Use a fresh full backup or coach export from the device where reviews were confirmed:

```sh
npm run audit:intelligence -- /path/to/export.json local-data/intelligence-report.json
```

Optional `--simulate-backfill` adds a separate hypothetical classification report for
records lacking intelligence. It does not alter the export, restore data, or imply
anything about records added/confirmed since the export. The command refuses to
overwrite an existing report or its source. Reports belong in ignored `local-data/`
because exports may contain private exercise data.

Validation must use the latest export before claiming that the live exercise library
is clean. Repository seeds and old exports cannot verify current user confirmations.

## Verification

Run the existing CI steps, `npm ci`, `npm test`, and `npm run build`. Regression tests
cover malformed metadata, preserved confirmations, idempotent repeated audits,
duplicate candidates/conflicts, unresolved confirmations, muscle label cleanup,
independent classifier output, and shipped Trident catalogue coverage.
