import { useEffect, useMemo, useState } from 'react'
import {
  check_cloud_sync_backend,
  clear_cloud_sync_configuration,
  configure_cloud_sync,
  load_cloud_sync_status,
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
      backendHealth?.contract_version === '1.0.0',
  )

  async function refresh() {
    setStatus(await load_cloud_sync_status())
  }

  useEffect(() => {
    void refresh().catch((cause) => {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load sync status.',
      )
    })
  }, [])

  useEffect(() => {
    if (status?.project_url && !projectUrl) {
      setProjectUrl(status.project_url)
    }
  }, [status, projectUrl])

  const state_label = useMemo(() => {
    if (!status?.configured) return 'NOT CONFIGURED'
    if (!status.signed_in) return 'SIGNED OUT'
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
            revisioned mutations between signed-in devices and refuses silent
            overwrites when revisions conflict.
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
                configure_cloud_sync(projectUrl, anonKey)
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
                clear_cloud_sync_configuration()
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
                setMessage('Signed in. Check the backend before syncing.')
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

      <section className={styles.syncPanel}>
        <div>
          <span>MANUAL SYNC</span>
          <h2>Push local changes, then pull remote changes</h2>
          <p>
            CHECK BACKEND must pass before sync is enabled. First sync can take
            longer because the historical database already contains a substantial
            outbox. Conflicts stop the pull and preserve local data.
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
