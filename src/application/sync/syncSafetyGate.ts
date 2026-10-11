import type { SyncOutbox } from '../../domain/models'

/**
 * The old one-to-one reconciliation generated tombstones even while a
 * completed workout was still present. Never automatically upload those
 * deletion events until an operator can inspect the underlying records.
 */
export function is_dangerous_feedback_deletion(
  entry: Pick<SyncOutbox, 'entity_type' | 'operation' | 'synced_at'>,
): boolean {
  return entry.synced_at === null &&
    entry.operation === 'delete' &&
    (entry.entity_type === 'exercise_metrics' ||
      entry.entity_type === 'readiness_entry')
}
