import type {
  JsonValue,
  MutableEntity,
  SyncOutbox,
  SyncState,
} from '../../domain/models'

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

export interface SyncRemoteMutation {
  remote_change_id: string
  entity_type: string
  entity_id: string
  operation: SyncOutbox['operation']
  revision: number
  payload_json: JsonValue
  updated_at: string
}

export interface SyncPullResult {
  changes: SyncRemoteMutation[]
  next_cursor: string | null
  remote_user_id: string | null
  error: string | null
}

export interface SyncProvider {
  readonly id: string
  push_mutations(mutations: readonly SyncPushMutation[]): Promise<SyncPushResult>
  pull_changes(
    cursor: string | null,
    limit: number,
  ): Promise<SyncPullResult>
}

export interface SyncRepository {
  get_state(provider: string): Promise<SyncState | undefined>
  put_state(state: SyncState): Promise<string>
  list_pending(limit: number): Promise<SyncOutbox[]>
  mark_attempted(outbox_ids: readonly string[], attempted_at: string): Promise<void>
  mark_synced(outbox_ids: readonly string[], synced_at: string): Promise<void>
  count_pending(): Promise<number>
  get_local_entity(
    entity_type: string,
    entity_id: string,
  ): Promise<MutableEntity | undefined>
  has_pending_entity_mutation(
    entity_type: string,
    entity_id: string,
  ): Promise<boolean>
  apply_remote_entity(
    entity_type: string,
    entity: MutableEntity,
    applied_at: string,
  ): Promise<void>
}
