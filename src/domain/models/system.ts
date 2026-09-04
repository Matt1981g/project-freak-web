import type { JsonValue } from './common'

export interface SchemaMeta {
  key: 'main'
  db_schema_version: number
  data_contract_version: string
  created_at: string
  updated_at: string
}

export interface MigrationHistory {
  version: number
  app_version: string
  migration_name: string
  migration_checksum: string
  applied_at: string
  result: 'success' | 'failed'
}

export interface Device {
  id: string
  display_name: string
  platform: string
  first_seen_at: string
  last_seen_at: string
}

export interface Setting {
  key: string
  scope: 'global' | 'device'
  value_json: JsonValue
  updated_at: string
  device_id: string | null
}
