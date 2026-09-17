# PROJECT FREAK — Plan Health

Plan Health is a read-only runtime guard for the live training programme.

It runs automatically on app load and rechecks after programme imports, programme changes, settings changes, workout completion/discard, cloud sync completion, and when PF returns to the foreground.

## Statuses

- **PLAN OK** — actionable raw programme sessions and the visible Plan resolver agree, and visible sessions have loadable prescriptions, active exercises and programmed sets.
- **PLAN WARNING** — the plan remains usable, but a review condition exists, such as no remaining actionable sessions, an unscheduled session, multiple sessions on one date, or a missing template link.
- **PLAN HEALTH FAILED** — raw actionable programme data and the visible Plan disagree, or a visible workout contains broken prescription references.

Plan Health never edits, deletes or repairs programme data automatically. It exists to prevent silent programme failures from reaching the gym unnoticed.
