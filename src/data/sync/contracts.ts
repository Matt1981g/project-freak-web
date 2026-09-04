import type { JsonValue, SyncOutbox, SyncState } from '../../domain/models'

export interface SyncPushMutation {
  outbox_id: string
  entity_type: string
  entity_id: string
  operation: SyncOutbox['operation']
  revision: number
  payload_json: JsonValue
  created_at: string
}

export interface SyncPushResult {
  acknowledged_outbox_ids: string[]
  remote_user_id: string | null
  error: string | null
}

export interface SyncProvider {
  readonly id: string
  push_mutations(mutations: readonly SyncPushMutation[]): Promise<SyncPushResult>
}

export interface SyncRepository {
  get_state(provider: string): Promise<SyncState | undefined>
  put_state(state: SyncState): Promise<string>
  list_pending(limit: number): Promise<SyncOutbox[]>
  mark_attempted(outbox_ids: readonly string[], attempted_at: string): Promise<void>
  mark_synced(outbox_ids: readonly string[], synced_at: string): Promise<void>
  count_pending(): Promise<number>
}
