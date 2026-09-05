import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import {
  PROJECT_FREAK_DATA_CONTRACT_VERSION,
  PROJECT_FREAK_DB_SCHEMA_VERSION,
  PROJECT_FREAK_SCHEMA_V1,
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


export interface RestoreResult {
  restored: true
  restored_from_created_at: string
  total_records: number
  table_counts: Record<string, number>
  safety_backup: ProjectFreakBackup
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

function right_rotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

function sha256_fallback(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const bit_length = bytes.length * 8
  const with_one = bytes.length + 1
  const padded_length = Math.ceil((with_one + 8) / 64) * 64
  const buffer = new Uint8Array(padded_length)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80

  const view = new DataView(buffer.buffer)
  const high = Math.floor(bit_length / 0x100000000)
  const low = bit_length >>> 0
  view.setUint32(padded_length - 8, high, false)
  view.setUint32(padded_length - 4, low, false)

  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])

  const h = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ])

  const w = new Uint32Array(64)

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false)
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 =
        right_rotate(w[i - 15], 7) ^
        right_rotate(w[i - 15], 18) ^
        (w[i - 15] >>> 3)
      const s1 =
        right_rotate(w[i - 2], 17) ^
        right_rotate(w[i - 2], 19) ^
        (w[i - 2] >>> 10)

      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]

    for (let i = 0; i < 64; i += 1) {
      const sum1 =
        right_rotate(e, 6) ^
        right_rotate(e, 11) ^
        right_rotate(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (hh + sum1 + ch + k[i] + w[i]) >>> 0
      const sum0 =
        right_rotate(a, 2) ^
        right_rotate(a, 13) ^
        right_rotate(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + maj) >>> 0

      hh = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }

  return [...h]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('')
}

export async function sha256_text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)

  if (globalThis.crypto?.subtle) {
    return to_hex(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  }

  return sha256_fallback(value)
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

async function replace_database_tables(
  db: ProjectFreakDatabase,
  backup: ProjectFreakBackup,
): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table_name of PROJECT_FREAK_STORE_NAMES) {
      await db.table(table_name).clear()
    }

    for (const table_name of PROJECT_FREAK_STORE_NAMES) {
      const records = backup.database.tables[table_name]
      if (records.length > 0) {
        await db.table(table_name).bulkAdd(records)
      }
    }
  })
}

export async function verify_database_against_backup(
  db: ProjectFreakDatabase,
  backup: ProjectFreakBackup,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  for (const table_name of PROJECT_FREAK_STORE_NAMES) {
    const records = (await db.table(table_name).toArray()) as Array<
      Record<string, unknown>
    >
    counts[table_name] = records.length

    const checksum = await table_checksum(records)
    if (checksum !== backup.checksums.tables[table_name]) {
      throw new Error(
        `Restored database verification failed for ${table_name}.`,
      )
    }
  }

  return counts
}

export async function restore_validated_backup(
  db: ProjectFreakDatabase,
  preview: BackupPreview,
  context: BackupBuildContext,
): Promise<RestoreResult> {
  const validated = await preview_backup_json(JSON.stringify(preview.backup))
  const safety_backup = await build_full_backup(db, context)

  try {
    await replace_database_tables(db, validated.backup)
    const table_counts = await verify_database_against_backup(
      db,
      validated.backup,
    )

    return {
      restored: true,
      restored_from_created_at: validated.created_at,
      total_records: Object.values(table_counts).reduce(
        (total, count) => total + count,
        0,
      ),
      table_counts,
      safety_backup,
    }
  } catch (cause) {
    try {
      await replace_database_tables(db, safety_backup)
      await verify_database_against_backup(db, safety_backup)
    } catch {
      throw new Error(
        'Restore failed and the automatic safety rollback could not be verified. Keep the downloaded safety backup and do not make further changes.',
      )
    }

    throw new Error(
      cause instanceof Error
        ? `Restore failed. Original database was restored safely: ${cause.message}`
        : 'Restore failed. Original database was restored safely.',
    )
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
  const upgrading_v1_backup =
    db_schema_version === 1 && PROJECT_FREAK_DB_SCHEMA_VERSION === 2
  if (
    db_schema_version !== PROJECT_FREAK_DB_SCHEMA_VERSION &&
    !upgrading_v1_backup
  ) {
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
  const expected_names = upgrading_v1_backup
    ? Object.keys(PROJECT_FREAK_SCHEMA_V1).sort()
    : expected_store_names()
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

  for (const table_name of expected_names) {
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

  if (upgrading_v1_backup) {
    tables.synced_settings = []
    checksums.synced_settings = await table_checksum([])
    table_counts.synced_settings = 0
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
      db_schema_version: PROJECT_FREAK_DB_SCHEMA_VERSION,
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
    db_schema_version: backup.database.db_schema_version,
    data_contract_version: backup.database.data_contract_version,
    table_counts,
    total_records,
    backup,
  }
}
