import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import {
  PROJECT_FREAK_DATA_CONTRACT_VERSION,
  PROJECT_FREAK_DB_SCHEMA_VERSION,
  PROJECT_FREAK_STORE_NAMES,
} from '../../data/db/schema'

export const BACKUP_FORMAT = 'project-freak-backup' as const
export const BACKUP_SCHEMA_VERSION = '1.0.0' as const

export interface ProjectFreakBackup {
  format: typeof BACKUP_FORMAT
  schema_version: typeof BACKUP_SCHEMA_VERSION
  app_version: string | null
  created_at: string
  source_device_id: string | null
  database: {
    db_schema_version: number
    data_contract_version: string
    tables: Record<string, Array<Record<string, unknown>>>
  }
  checksums: {
    algorithm: 'sha256'
    tables: Record<string, string>
  }
}

export interface BackupPreview {
  valid: true
  created_at: string
  source_device_id: string | null
  db_schema_version: number
  data_contract_version: string
  table_counts: Record<string, number>
  total_records: number
  backup: ProjectFreakBackup
}

export interface BackupBuildContext {
  now_iso: string
  source_device_id: string | null
  app_version?: string | null
}

function assert_object(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
}

function assert_iso_datetime(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${label} must be a valid ISO date-time.`)
  }
}

function canonical_table_json(records: Array<Record<string, unknown>>): string {
  return JSON.stringify(records)
}

function to_hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256_text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser context.')
  }

  const bytes = new TextEncoder().encode(value)
  return to_hex(await globalThis.crypto.subtle.digest('SHA-256', bytes))
}

async function table_checksum(
  records: Array<Record<string, unknown>>,
): Promise<string> {
  return sha256_text(canonical_table_json(records))
}

function exact_store_names(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort()
}

function expected_store_names(): string[] {
  return [...PROJECT_FREAK_STORE_NAMES].sort()
}

export async function build_full_backup(
  db: ProjectFreakDatabase,
  context: BackupBuildContext,
): Promise<ProjectFreakBackup> {
  const metadata = await db.ensure_schema_metadata()
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  const checksums: Record<string, string> = {}

  for (const table_name of PROJECT_FREAK_STORE_NAMES) {
    const records = (await db.table(table_name).toArray()) as Array<
      Record<string, unknown>
    >
    tables[table_name] = records
    checksums[table_name] = await table_checksum(records)
  }

  return {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    app_version: context.app_version ?? null,
    created_at: context.now_iso,
    source_device_id: context.source_device_id,
    database: {
      db_schema_version: metadata.db_schema_version,
      data_contract_version: metadata.data_contract_version,
      tables,
    },
    checksums: {
      algorithm: 'sha256',
      tables: checksums,
    },
  }
}

export async function preview_backup_json(
  json_text: string,
): Promise<BackupPreview> {
  let parsed: unknown

  try {
    parsed = JSON.parse(json_text)
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }

  assert_object(parsed, 'Backup')

  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error('This is not a PROJECT FREAK backup file.')
  }
  if (parsed.schema_version !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup schema version: ${String(parsed.schema_version)}.`,
    )
  }

  assert_iso_datetime(parsed.created_at, 'Backup created_at')

  if (
    parsed.app_version !== null &&
    parsed.app_version !== undefined &&
    typeof parsed.app_version !== 'string'
  ) {
    throw new Error('Backup app_version must be a string or null.')
  }

  if (
    parsed.source_device_id !== null &&
    parsed.source_device_id !== undefined &&
    typeof parsed.source_device_id !== 'string'
  ) {
    throw new Error('Backup source_device_id must be a string or null.')
  }

  assert_object(parsed.database, 'Backup database')
  const db_schema_version = parsed.database.db_schema_version
  if (
    typeof db_schema_version !== 'number' ||
    !Number.isInteger(db_schema_version) ||
    db_schema_version < 1
  ) {
    throw new Error('Backup database schema version is invalid.')
  }
  if (db_schema_version !== PROJECT_FREAK_DB_SCHEMA_VERSION) {
    throw new Error(
      `Backup database schema v${db_schema_version} is not compatible with this app (v${PROJECT_FREAK_DB_SCHEMA_VERSION}).`,
    )
  }

  if (parsed.database.data_contract_version !== PROJECT_FREAK_DATA_CONTRACT_VERSION) {
    throw new Error(
      `Backup data contract ${String(parsed.database.data_contract_version)} is not compatible with this app (${PROJECT_FREAK_DATA_CONTRACT_VERSION}).`,
    )
  }

  assert_object(parsed.database.tables, 'Backup database tables')

  const actual_names = exact_store_names(parsed.database.tables)
  const expected_names = expected_store_names()
  if (JSON.stringify(actual_names) !== JSON.stringify(expected_names)) {
    const missing = expected_names.filter((name) => !actual_names.includes(name))
    const extra = actual_names.filter((name) => !expected_names.includes(name))
    const detail = [
      missing.length ? `missing: ${missing.join(', ')}` : '',
      extra.length ? `unexpected: ${extra.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ')
    throw new Error(`Backup table set does not match this database${detail ? ` (${detail})` : ''}.`)
  }

  assert_object(parsed.checksums, 'Backup checksums')
  if (parsed.checksums.algorithm !== 'sha256') {
    throw new Error('Backup checksum algorithm must be sha256.')
  }
  assert_object(parsed.checksums.tables, 'Backup table checksums')

  const checksum_names = exact_store_names(parsed.checksums.tables)
  if (JSON.stringify(checksum_names) !== JSON.stringify(expected_names)) {
    throw new Error('Backup checksums do not cover every database table.')
  }

  const tables: Record<string, Array<Record<string, unknown>>> = {}
  const checksums: Record<string, string> = {}
  const table_counts: Record<string, number> = {}
  let total_records = 0

  for (const table_name of PROJECT_FREAK_STORE_NAMES) {
    const raw_records = parsed.database.tables[table_name]
    if (!Array.isArray(raw_records)) {
      throw new Error(`Backup table ${table_name} must be an array.`)
    }

    const records: Array<Record<string, unknown>> = []
    for (const [index, record] of raw_records.entries()) {
      assert_object(record, `Backup table ${table_name} record ${index + 1}`)
      records.push(record)
    }

    const expected_checksum = parsed.checksums.tables[table_name]
    if (
      typeof expected_checksum !== 'string' ||
      !/^[a-f0-9]{64}$/.test(expected_checksum)
    ) {
      throw new Error(`Backup checksum for ${table_name} is invalid.`)
    }

    const actual_checksum = await table_checksum(records)
    if (actual_checksum !== expected_checksum) {
      throw new Error(
        `Backup checksum failed for ${table_name}. The file may be damaged or altered.`,
      )
    }

    tables[table_name] = records
    checksums[table_name] = expected_checksum
    table_counts[table_name] = records.length
    total_records += records.length
  }

  const backup: ProjectFreakBackup = {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    app_version:
      typeof parsed.app_version === 'string' ? parsed.app_version : null,
    created_at: parsed.created_at,
    source_device_id:
      typeof parsed.source_device_id === 'string'
        ? parsed.source_device_id
        : null,
    database: {
      db_schema_version,
      data_contract_version: parsed.database.data_contract_version as string,
      tables,
    },
    checksums: {
      algorithm: 'sha256',
      tables: checksums,
    },
  }

  return {
    valid: true,
    created_at: backup.created_at,
    source_device_id: backup.source_device_id,
    db_schema_version,
    data_contract_version: backup.database.data_contract_version,
    table_counts,
    total_records,
    backup,
  }
}
