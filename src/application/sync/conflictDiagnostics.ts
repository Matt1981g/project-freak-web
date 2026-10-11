import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'

export interface LocalConflictBrief {
  entity_type: string
  entity_id: string
  reason: string | null
  recorded_at: string
}

export interface LocalConflictDiagnostics {
  retained_total: number
  recent: LocalConflictBrief[]
}

/** Non-destructive view of device-local quarantined snapshots, not server SQL conflicts. */
export async function load_local_conflict_diagnostics(
  db: ProjectFreakDatabase,
): Promise<LocalConflictDiagnostics> {
  const retained_total = await db.audit_events.where('action').equals('sync_conflict').count()
  if (retained_total === 0) return { retained_total, recent: [] }

  // Index scan from newest records; never expose full training payloads in
  // the routine diagnostics page. The underlying audit evidence remains
  // untouched and is included in complete backups.
  const rows = await db.audit_events
    .orderBy('created_at')
    .reverse()
    .filter((record) => record.action === 'sync_conflict')
    .limit(6)
    .toArray()

  return {
    retained_total,
    recent: rows.map((row) => ({
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      reason: row.reason,
      recorded_at: row.created_at,
    })),
  }
}
