/**
 * Stable comparison of sync snapshots without treating object key order as
 * data divergence. Both the coordinator and the transactional Dexie guard
 * must use exactly the same comparison policy.
 */
export function canonicalise_sync_json(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalise_sync_json).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) =>
      `${JSON.stringify(key)}:${canonicalise_sync_json(nested)}`,
    )

  return `{${entries.join(',')}}`
}
