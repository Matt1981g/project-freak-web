export const AUTO_SYNC_FOREGROUND_INTERVAL_MS = 5 * 60 * 1000
export const AUTO_SYNC_MIN_GAP_MS = 30 * 1000

export interface AutoSyncEligibility {
  configured: boolean
  signed_in: boolean
  online: boolean
  visible: boolean
  now_ms: number
  last_attempt_ms: number | null
  force?: boolean
}

export function should_attempt_auto_sync(
  input: AutoSyncEligibility,
): boolean {
  if (!input.configured || !input.signed_in) return false
  if (!input.online || !input.visible) return false
  if (input.force || input.last_attempt_ms === null) return true

  return input.now_ms - input.last_attempt_ms >= AUTO_SYNC_MIN_GAP_MS
}
