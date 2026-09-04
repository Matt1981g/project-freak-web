import { useMemo, useState } from 'react'
import {
  build_database_backup,
  preview_database_backup,
  restore_database_backup,
} from '../../app/projectFreakServices'
import type {
  BackupPreview,
  ProjectFreakBackup,
} from '../../application/backup/databaseBackup'
import styles from './BackupScreen.module.css'

function backup_filename(backup: ProjectFreakBackup): string {
  const stamp = backup.created_at
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '')
  return `PROJECT_FREAK_Backup_${stamp}.json`
}

function total_records(backup: ProjectFreakBackup): number {
  return Object.values(backup.database.tables).reduce(
    (total, records) => total + records.length,
    0,
  )
}

function format_date_time(value: string): string {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString()
    : value
}

export function BackupScreen() {
  const [backup, setBackup] = useState<ProjectFreakBackup | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [building, setBuilding] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const backupJson = useMemo(
    () => (backup ? JSON.stringify(backup, null, 2) : ''),
    [backup],
  )

  async function build_backup() {
    setBuilding(true)
    setError(null)
    setStatus(null)

    try {
      const next = await build_database_backup()
      setBackup(next)
      setStatus('Full database backup built and checksummed.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to build database backup.',
      )
    } finally {
      setBuilding(false)
    }
  }

  function download_backup_payload(
    value: ProjectFreakBackup,
    filename = backup_filename(value),
  ) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function download_backup() {
    if (!backup || !backupJson) return

    download_backup_payload(backup)
    setStatus('Backup downloaded.')
    setError(null)
  }

  async function restore_backup() {
    if (!preview || restoring) return

    const confirmed = window.confirm(
      'Restore this backup? The current database will be replaced. A safety backup will be downloaded first.',
    )
    if (!confirmed) return

    setRestoring(true)
    setError(null)
    setStatus('Building safety backup before restore…')

    try {
      const safety = await build_database_backup()
      download_backup_payload(
        safety,
        backup_filename(safety).replace(
          'PROJECT_FREAK_Backup_',
          'PROJECT_FREAK_SAFETY_BEFORE_RESTORE_',
        ),
      )

      setStatus('Safety backup downloaded. Restoring database…')
      const result = await restore_database_backup(preview)
      setBackup(result.safety_backup)
      setStatus(
        `RESTORE COMPLETE ✓ ${result.total_records.toLocaleString()} records restored and verified. Reload the app before continuing.`,
      )
      setError(null)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Database restore failed.',
      )
    } finally {
      setRestoring(false)
    }
  }

  async function preview_restore(file: File) {
    setPreviewing(true)
    setPreview(null)
    setError(null)
    setStatus(null)

    try {
      const result = await preview_database_backup(file)
      setPreview(result)
      setStatus('Backup validated. No database records were changed.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to validate backup file.',
      )
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>DATABASE SAFETY</p>
          <h1>Backup & Restore</h1>
          <p>
            Export every local PROJECT FREAK table with SHA-256 checksums.
            Restore validates first, downloads a safety backup, then replaces the
            database transactionally and verifies the restored data.
          </p>
        </div>
        <span>PHASE 12</span>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>FULL BACKUP</span>
            <h2>Protect the local database</h2>
          </div>
          <strong>ALL TABLES</strong>
        </div>

        <p>
          Includes historical imports, exercise definitions and aliases,
          programmes, actual workouts, readiness/recovery, priorities, Coach
          exclusions, audit records and sync metadata.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void build_backup()}
            disabled={building}
          >
            {building ? 'BUILDING…' : 'BUILD BACKUP'}
          </button>
          <button
            type="button"
            onClick={download_backup}
            disabled={!backup || building}
          >
            DOWNLOAD BACKUP
          </button>
        </div>

        {backup && (
          <div className={styles.summaryGrid}>
            <div>
              <span>CREATED</span>
              <strong>{format_date_time(backup.created_at)}</strong>
            </div>
            <div>
              <span>DB SCHEMA</span>
              <strong>v{backup.database.db_schema_version}</strong>
            </div>
            <div>
              <span>TABLES</span>
              <strong>{Object.keys(backup.database.tables).length}</strong>
            </div>
            <div>
              <span>RECORDS</span>
              <strong>{total_records(backup).toLocaleString()}</strong>
            </div>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>RESTORE PREVIEW</span>
            <h2>Validate before touching anything</h2>
          </div>
          <strong>VALIDATE FIRST</strong>
        </div>

        <p>
          Select a PROJECT FREAK backup. The app checks format, schema,
          data-contract version, exact table set and every SHA-256 checksum.
          Previewing never writes to IndexedDB.
        </p>

        <label className={styles.filePicker}>
          <span>{previewing ? 'VALIDATING…' : 'SELECT BACKUP FILE'}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={previewing}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void preview_restore(file)
              event.currentTarget.value = ''
            }}
          />
        </label>

        {preview && (
          <>
            <div className={styles.validBanner}>
              <strong>VALID BACKUP ✓</strong>
              <span>Ready for transactional restore.</span>
            </div>

            <div className={styles.summaryGrid}>
              <div>
                <span>CREATED</span>
                <strong>{format_date_time(preview.created_at)}</strong>
              </div>
              <div>
                <span>DB SCHEMA</span>
                <strong>v{preview.db_schema_version}</strong>
              </div>
              <div>
                <span>TABLES</span>
                <strong>{Object.keys(preview.table_counts).length}</strong>
              </div>
              <div>
                <span>RECORDS</span>
                <strong>{preview.total_records.toLocaleString()}</strong>
              </div>
            </div>

            <details className={styles.tableCounts}>
              <summary>TABLE COUNTS</summary>
              <div>
                {Object.entries(preview.table_counts).map(([name, count]) => (
                  <span key={name}>
                    <strong>{name}</strong>
                    <small>{count.toLocaleString()}</small>
                  </span>
                ))}
              </div>
            </details>

            <button
              type="button"
              className={styles.restoreButton}
              disabled={restoring || previewing}
              onClick={() => void restore_backup()}
            >
              {restoring ? 'RESTORING…' : 'RESTORE BACKUP'}
            </button>
          </>
        )}
      </section>

      <section className={styles.warning}>
        <span>RESTORE SAFETY</span>
        <strong>Safety backup → atomic replace → checksum verification.</strong>
        <p>
          If a write fails, the transaction rolls back. If verification fails
          after the transaction, PROJECT FREAK automatically restores and verifies
          the pre-restore safety copy. Reload the app after a successful restore
          so every screen reads the restored state.
        </p>
      </section>

      {status && <div className={styles.status}>{status}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
