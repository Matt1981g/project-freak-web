import { useEffect, useMemo, useState } from 'react'
import {
  check_cloud_sync_backend,
  clear_cloud_sync_configuration,
  configure_cloud_sync,
  load_cloud_sync_status,
  load_cloud_sync_conflict_diagnostics,
  link_cloud_sync_dataset,
  run_full_cloud_sync,
  sign_in_cloud_sync,
  sign_out_cloud_sync,
  sign_up_cloud_sync,
  type CloudSyncStatus,
  type FullCloudSyncResult,
} from '../../app/projectFreakServices'
import styles from './SyncScreen.module.css'

function format_date(value: string | null | undefined): string {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

export function SyncScreen() {
  const [status, setStatus] = useState<CloudSyncStatus | null>(null)
  const [localConflicts, setLocalConflicts] = useState<Awaited<ReturnType<typeof load_cloud_sync_conflict_diagnostics>> | null>(null)
  const [projectUrl, setProjectUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<FullCloudSyncResult | null>(null)
  const [backendHealth, setBackendHealth] = useState<
    Awaited<ReturnType<typeof check_cloud_sync_backend>> | null
  >(null)

  const can_auth = Boolean(status?.configured)
  const can_sync = Boolean(
    status?.configured &&
      status?.signed_in &&
      status.dataset_binding === 'matched' &&
      backendHealth?.contract_version === '1.0.0',
  )

  async function refresh() {
    const [next_status, conflicts] = await Promise.all([
      load_cloud_sync_status(),
      load_cloud_sync_conflict_diagnostics(),
    ])
    setStatus(next_status)
    setLocalConflicts(conflicts)
    setProjectUrl((current) => current || next_status.project_url || '')
  }

  useEffect(() => {
    void Promise.resolve().then(refresh).catch((cause) => {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load sync status.',
      )
    })
  }, [])


  const state_label = useMemo(() => {
    if (!status?.configured) return 'NOT CONFIGURED'
    if (!status.signed_in) return 'SIGNED OUT'
    if (status.dataset_binding === 'unbound') return 'LINK REQUIRED'
    if (status.dataset_binding === 'mismatch') return 'ACCOUNT MISMATCH'
    return (status.sync_state?.status ?? 'idle').toUpperCase()
  }, [status])

  async function run_action(
    name: string,
    action: () => Promise<void>,
  ) {
    setBusy(name)
    setError(null)
    setMessage(null)

    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Cloud sync action failed.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PHASE 14</p>
          <h1>Cloud Sync</h1>
          <p>
            IndexedDB remains the local source of truth. Cloud sync moves
            revisioned mutations between signed-in devices. Equal-revision
            device races are resolved deterministically and retained in the
            backend conflict audit so sync can converge without silently
            discarding the competing snapshots.
          </p>
        </div>
        <span>{state_label}</span>
      </section>

      <section className={styles.statusGrid}>
        <div>
          <span>CONFIGURED</span>
          <strong>{status?.configured ? 'YES' : 'NO'}</strong>
        </div>
        <div>
          <span>SIGNED IN</span>
          <strong>{status?.signed_in ? 'YES' : 'NO'}</strong>
        </div>
        <div>
          <span>PENDING</span>
          <strong>{status?.pending_mutations ?? '…'}</strong>
        </div>
        <div>
          <span>ACCOUNT</span>
          <strong>{status?.email ?? '—'}</strong>
        </div>
        <div>
          <span>LAST PUSH</span>
          <strong>{format_date(status?.sync_state?.last_push_at)}</strong>
        </div>
        <div>
          <span>LAST PULL</span>
          <strong>{format_date(status?.sync_state?.last_pull_at)}</strong>
        </div>
        <div>
          <span>BACKEND VERIFIED</span>
          <strong>{backendHealth ? 'YES' : 'NO'}</strong>
        </div>
        <div>
          <span>AUTO SYNC</span>
          <strong>
            {status?.configured && status?.signed_in &&
            status.dataset_binding === 'matched' ? 'ON' : 'WAITING'}
          </strong>
        </div>
      </section>

      <section className={styles.panel} aria-label="Local sync conflict diagnostics">
        <div className={styles.panelHeading}>
          <div>
            <span>RECOVERY EVIDENCE</span>
            <h2>Retained local sync conflicts</h2>
          </div>
          <strong>{localConflicts?.retained_total ?? '…'} SAVED</strong>
        </div>
        <p>
          Competing cloud revisions are retained in this device's local audit,
          not silently discarded. The complete backup preserves these records.
          This is local evidence only; it does not include Supabase's server-side conflict history.
        </p>
        {localConflicts && localConflicts.recent.length > 0 && (
          <ul className={styles.conflictList}>
            {localConflicts.recent.map((conflict, index) => (
              <li key={`${conflict.entity_type}:${conflict.entity_id}:${conflict.recorded_at}:${index}`}>
                <strong>{conflict.entity_type.replaceAll('_', ' ')} · {conflict.entity_id.slice(0, 12)}</strong>
                <span>{conflict.reason ?? 'Competing cloud revision preserved'}</span>
                <time dateTime={conflict.recorded_at}>{format_date(conflict.recorded_at)}</time>
              </li>
            ))}
          </ul>
        )}
        <p>
          These records have not been automatically resolved. Keep a current
          full backup before investigating a disagreement between PC and iPhone.
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>BACKEND</span>
            <h2>Supabase project</h2>
          </div>
          <strong>LOCAL CONFIG</strong>
        </div>

        <p>
          The project URL and anon key are stored only in this browser container.
          The anon key is a public client credential. Do not paste a Supabase
          service-role key here.
        </p>

        <label>
          <span>PROJECT URL</span>
          <input
            value={projectUrl}
            onChange={(event) => setProjectUrl(event.target.value)}
            placeholder="https://your-project.supabase.co"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>

        <label>
          <span>ANON KEY</span>
          <textarea
            value={anonKey}
            onChange={(event) => setAnonKey(event.target.value)}
            placeholder="Supabase anon/public key"
            rows={3}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>

        <div className={styles.actions}>
          <button
            className={styles.primary}
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run_action('config', async () => {
                await configure_cloud_sync(projectUrl, anonKey)
                setBackendHealth(null)
                setAnonKey('')
                setMessage('Supabase configuration saved on this device.')
              })
            }
          >
            {busy === 'config' ? 'SAVING…' : 'SAVE CONFIG'}
          </button>

          <button
            type="button"
            disabled={!status?.configured || busy !== null}
            onClick={() =>
              void run_action('clear', async () => {
                await clear_cloud_sync_configuration()
                setBackendHealth(null)
                setProjectUrl('')
                setAnonKey('')
                setMessage('Cloud configuration and local auth session cleared.')
              })
            }
          >
            CLEAR CONFIG
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>ACCOUNT</span>
            <h2>Same login on every device</h2>
          </div>
          <strong>AUTHENTICATED</strong>
        </div>

        <p>
          Use the same account on PC and iPhone. Passwords are sent directly to
          Supabase over HTTPS and are never stored by PROJECT FREAK.
        </p>

        <div className={styles.authGrid}>
          <label>
            <span>EMAIL</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          <label>
            <span>PASSWORD</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.primary}
            type="button"
            disabled={!can_auth || busy !== null}
            onClick={() =>
              void run_action('signin', async () => {
                await sign_in_cloud_sync(email, password)
                setBackendHealth(null)
                setPassword('')
                setMessage('Signed in. Check the backend and dataset ownership before syncing.')
              })
            }
          >
            {busy === 'signin' ? 'SIGNING IN…' : 'SIGN IN'}
          </button>

          <button
            type="button"
            disabled={!can_auth || busy !== null}
            onClick={() =>
              void run_action('signup', async () => {
                const session = await sign_up_cloud_sync(email, password)
                setBackendHealth(null)
                setPassword('')
                setMessage(
                  session
                    ? 'Account created and signed in.'
                    : 'Account created. Confirm the email if Supabase requires it, then sign in.',
                )
              })
            }
          >
            {busy === 'signup' ? 'CREATING…' : 'CREATE ACCOUNT'}
          </button>

          <button
            type="button"
            disabled={!status?.signed_in || busy !== null}
            onClick={() =>
              void run_action('check', async () => {
                const health = await check_cloud_sync_backend()
                setBackendHealth(health)
                setMessage(
                  `Backend verified. Contract ${health.contract_version}, ${health.entity_count} remote entities, ${health.change_count} remote changes.`,
                )
              })
            }
          >
            {busy === 'check' ? 'CHECKING…' : 'CHECK BACKEND'}
          </button>

          <button
            type="button"
            disabled={!status?.signed_in || busy !== null}
            onClick={() =>
              void run_action('signout', async () => {
                await sign_out_cloud_sync()
                setBackendHealth(null)
                setMessage('Signed out on this device.')
              })
            }
          >
            SIGN OUT
          </button>
        </div>
      </section>

      {status?.signed_in && status.dataset_binding === 'unbound' && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>DATA OWNERSHIP</span>
              <h2>Confirm before your first cloud sync</h2>
            </div>
            <strong>UPLOAD PAUSED</strong>
          </div>
          <p>
            This browser contains a dataset that has not yet been linked to a
            Supabase identity. Check the account and project below. Linking is
            permanent for this local dataset; it does not delete workouts or
            upload them by itself. Other accounts require a separate browser
            profile.
          </p>
          <p>
            Account: <strong>{status.email ?? status.user_id ?? 'Unknown'}</strong>
            {' · '}Project: <strong>{status.project_url ?? 'Unknown'}</strong>
          </p>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="button"
              disabled={busy !== null || !backendHealth ||
                backendHealth.authenticated_user_id !== status.user_id}
              onClick={() => {
                if (!window.confirm(
                  `Link this browser's existing training data to ${status.email ?? status.user_id} at ${status.project_url}? This cannot be reassigned to another account. Continue?`,
                )) return
                void run_action('link', async () => {
                  await link_cloud_sync_dataset()
                  setMessage('Dataset linked. Check backend and sync when ready.')
                })
              }}
            >
              {busy === 'link' ? 'LINKING…' : 'LINK THIS DATASET'}
            </button>
          </div>
        </section>
      )}

      {status?.dataset_binding === 'mismatch' && (
        <section className={styles.panel}>
          <h2>Dataset belongs to another cloud account or project</h2>
          <p>
            Synchronisation is blocked. Sign in to the original account at
            { ' ' }{status.dataset_owner_project_url ?? 'the original project'},
            or open a separate browser profile. No local records were deleted.
          </p>
        </section>
      )}

      <section className={styles.syncPanel}>
        <div>
          <span>SYNC CONTROL</span>
          <h2>Automatic foreground sync + manual fallback</h2>
          <p>
            When signed in, PROJECT FREAK now syncs on app open, return from
            background, restored internet, workout completion and programme
            import, plus every 5 minutes while the app is visible. iOS cannot
            reliably wake a fully closed PWA, so SYNC NOW remains the manual
            fallback. CHECK BACKEND must pass before the manual button is enabled.
          </p>
        </div>

        <button
          type="button"
          disabled={!can_sync || busy !== null}
          onClick={() =>
            void run_action('sync', async () => {
              const result = await run_full_cloud_sync()
              setLastResult(result)
              if (result.error) {
                throw new Error(result.error)
              }
              setMessage(
                `Sync complete. ${result.acknowledged} pushed, ${result.applied} remote changes applied.`,
              )
            })
          }
        >
          {busy === 'sync' ? 'SYNCING…' : 'SYNC NOW'}
        </button>
      </section>

      {lastResult && (
        <section className={styles.resultGrid}>
          <div>
            <span>PUSH ATTEMPTS</span>
            <strong>{lastResult.pushed}</strong>
          </div>
          <div>
            <span>ACKNOWLEDGED</span>
            <strong>{lastResult.acknowledged}</strong>
          </div>
          <div>
            <span>PULLED</span>
            <strong>{lastResult.pulled}</strong>
          </div>
          <div>
            <span>APPLIED</span>
            <strong>{lastResult.applied}</strong>
          </div>
          <div>
            <span>SKIPPED</span>
            <strong>{lastResult.skipped}</strong>
          </div>
          <div>
            <span>PENDING</span>
            <strong>{lastResult.pending_after}</strong>
          </div>
        </section>
      )}

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
