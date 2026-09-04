export const AUTO_SYNC_REQUEST_EVENT = 'project-freak:auto-sync-request'
export const AUTO_SYNC_COMPLETE_EVENT = 'project-freak:auto-sync-complete'

export type AutoSyncReason =
  | 'app_open'
  | 'app_resume'
  | 'online'
  | 'foreground_interval'
  | 'workout_completed'
  | 'programme_imported'

export interface AutoSyncRequestDetail {
  reason: AutoSyncReason
}

export function request_auto_sync(reason: AutoSyncReason): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<AutoSyncRequestDetail>(AUTO_SYNC_REQUEST_EVENT, {
      detail: { reason },
    }),
  )
}
