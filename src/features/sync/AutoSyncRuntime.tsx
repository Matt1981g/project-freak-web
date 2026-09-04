import { useEffect, useRef } from 'react'
import {
  load_cloud_sync_status,
  run_full_cloud_sync,
} from '../../app/projectFreakServices'
import {
  AUTO_SYNC_COMPLETE_EVENT,
  AUTO_SYNC_REQUEST_EVENT,
  type AutoSyncReason,
  type AutoSyncRequestDetail,
} from '../../application/sync/autoSyncEvents'
import {
  AUTO_SYNC_FOREGROUND_INTERVAL_MS,
  should_attempt_auto_sync,
} from '../../application/sync/autoSyncPolicy'

export function AutoSyncRuntime() {
  const lastAttemptAt = useRef<number | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)

  useEffect(() => {
    function attempt(reason: AutoSyncReason, force = false): Promise<void> {
      if (inFlight.current) return inFlight.current

      const operation = (async () => {
        const status = await load_cloud_sync_status()
        const now = Date.now()

        if (
          !should_attempt_auto_sync({
            configured: status.configured,
            signed_in: status.signed_in,
            online: navigator.onLine !== false,
            visible: document.visibilityState === 'visible',
            now_ms: now,
            last_attempt_ms: lastAttemptAt.current,
            force,
          })
        ) {
          return
        }

        lastAttemptAt.current = now

        try {
          const result = await run_full_cloud_sync()

          if (!result.error) {
            window.dispatchEvent(
              new CustomEvent(AUTO_SYNC_COMPLETE_EVENT, {
                detail: { reason, result },
              }),
            )
          }
        } catch {
          // Auto sync must never interrupt workout logging. The manual Sync
          // screen remains available for diagnostics and recovery.
        }
      })().finally(() => {
        inFlight.current = null
      })

      inFlight.current = operation
      return operation
    }

    function handle_visibility_change() {
      if (document.visibilityState === 'visible') {
        void attempt('app_resume')
      }
    }

    function handle_online() {
      void attempt('online', true)
    }

    function handle_request(event: Event) {
      const detail = (event as CustomEvent<AutoSyncRequestDetail>).detail
      void attempt(detail?.reason ?? 'foreground_interval', true)
    }

    const intervalId = window.setInterval(() => {
      void attempt('foreground_interval')
    }, AUTO_SYNC_FOREGROUND_INTERVAL_MS)

    document.addEventListener('visibilitychange', handle_visibility_change)
    window.addEventListener('online', handle_online)
    window.addEventListener(AUTO_SYNC_REQUEST_EVENT, handle_request)

    void attempt('app_open', true)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener(
        'visibilitychange',
        handle_visibility_change,
      )
      window.removeEventListener('online', handle_online)
      window.removeEventListener(AUTO_SYNC_REQUEST_EVENT, handle_request)
    }
  }, [])

  return null
}
