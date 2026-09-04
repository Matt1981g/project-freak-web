import type { JsonValue } from './common'

export interface SyncOutbox {
  id: string
  entity_type: string
  entity_id: string
  operation: 'upsert' | 'delete'
  revision: number
  payload_json: JsonValue
  created_at: string
  attempt_count: number
  last_attempt_at: string | null
  synced_at: string | null
}

export interface SyncState {
  provider: string
  remote_user_id: string | null
  pull_cursor: string | null
  last_pull_at: string | null
  last_push_at: string | null
  status: 'disconnected' | 'idle' | 'syncing' | 'error'
  error: string | null
}
