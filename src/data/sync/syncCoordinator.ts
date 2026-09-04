import type { SyncOutbox, SyncState } from '../../domain/models'
import type {
  SyncProvider,
  SyncPushMutation,
  SyncRepository,
} from './contracts'

export interface RunPushSyncOptions {
  now_iso: string
  batch_size?: number
}

export interface RunPushSyncResult {
  provider: string
  attempted: number
  acknowledged: number
  pending_after: number
  status: SyncState['status']
  error: string | null
}

const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 500

function initial_state(provider: string): SyncState {
  return {
    provider,
    remote_user_id: null,
    pull_cursor: null,
    last_pull_at: null,
    last_push_at: null,
    status: 'idle',
    error: null,
  }
}

function to_push_mutation(entry: SyncOutbox): SyncPushMutation {
  return {
    outbox_id: entry.id,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    operation: entry.operation,
    revision: entry.revision,
    payload_json: entry.payload_json,
    created_at: entry.created_at,
  }
}

function validate_acknowledgements(
  attempted_ids: ReadonlySet<string>,
  acknowledged_ids: readonly string[],
): string[] {
  const unique = [...new Set(acknowledged_ids)]

  for (const id of unique) {
    if (!attempted_ids.has(id)) {
      throw new Error(
        `Sync provider acknowledged an outbox record that was not in this batch: ${id}`,
      )
    }
  }

  return unique
}

function normalise_batch_size(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BATCH_SIZE
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(
      `Sync batch size must be a whole number from 1 to ${MAX_BATCH_SIZE}.`,
    )
  }
  return value
}

export async function run_push_sync(
  repository: SyncRepository,
  provider: SyncProvider,
  options: RunPushSyncOptions,
): Promise<RunPushSyncResult> {
  const batch_size = normalise_batch_size(options.batch_size)
  const previous_state =
    (await repository.get_state(provider.id)) ?? initial_state(provider.id)

  await repository.put_state({
    ...previous_state,
    status: 'syncing',
    error: null,
  })

  const pending = await repository.list_pending(batch_size)

  if (pending.length === 0) {
    const idle_state: SyncState = {
      ...previous_state,
      status: 'idle',
      error: null,
    }
    await repository.put_state(idle_state)

    return {
      provider: provider.id,
      attempted: 0,
      acknowledged: 0,
      pending_after: 0,
      status: 'idle',
      error: null,
    }
  }

  const attempted_ids = pending.map((entry) => entry.id)
  await repository.mark_attempted(attempted_ids, options.now_iso)

  try {
    const response = await provider.push_mutations(
      pending.map(to_push_mutation),
    )
    const acknowledged_ids = validate_acknowledgements(
      new Set(attempted_ids),
      response.acknowledged_outbox_ids,
    )

    if (acknowledged_ids.length > 0) {
      await repository.mark_synced(acknowledged_ids, options.now_iso)
    }

    const missing_acknowledgements =
      acknowledged_ids.length !== attempted_ids.length
    const error =
      response.error ??
      (missing_acknowledgements
        ? `Provider acknowledged ${acknowledged_ids.length} of ${attempted_ids.length} mutations.`
        : null)
    const status: SyncState['status'] = error === null ? 'idle' : 'error'

    await repository.put_state({
      ...previous_state,
      remote_user_id:
        response.remote_user_id ?? previous_state.remote_user_id,
      last_push_at:
        acknowledged_ids.length > 0
          ? options.now_iso
          : previous_state.last_push_at,
      status,
      error,
    })

    return {
      provider: provider.id,
      attempted: attempted_ids.length,
      acknowledged: acknowledged_ids.length,
      pending_after: await repository.count_pending(),
      status,
      error,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown sync provider error.'

    await repository.put_state({
      ...previous_state,
      status: 'error',
      error: message,
    })

    return {
      provider: provider.id,
      attempted: attempted_ids.length,
      acknowledged: 0,
      pending_after: await repository.count_pending(),
      status: 'error',
      error: message,
    }
  }
}
