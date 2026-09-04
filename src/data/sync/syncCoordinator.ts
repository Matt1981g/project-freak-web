import type {
  JsonValue,
  MutableEntity,
  SyncOutbox,
  SyncState,
} from '../../domain/models'
import type {
  SyncProvider,
  SyncPushMutation,
  SyncRemoteMutation,
  SyncRepository,
} from './contracts'

export interface RunPushSyncOptions {
  now_iso: string
  batch_size?: number
}

export interface RunPullSyncOptions {
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

export interface RunPullSyncResult {
  provider: string
  received: number
  applied: number
  skipped: number
  conflicts: number
  cursor: string | null
  status: SyncState['status']
  error: string | null
}

export interface RunSyncCycleResult {
  push: RunPushSyncResult
  pull: RunPullSyncResult | null
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

function is_record(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parse_remote_entity(change: SyncRemoteMutation): MutableEntity {
  if (!is_record(change.payload_json)) {
    throw new Error(
      `Remote sync payload for ${change.entity_type}:${change.entity_id} is not an object.`,
    )
  }

  const payload = change.payload_json
  const required_strings = ['id', 'created_at', 'updated_at', 'device_id'] as const

  for (const key of required_strings) {
    if (typeof payload[key] !== 'string' || payload[key].length === 0) {
      throw new Error(
        `Remote sync payload for ${change.entity_type}:${change.entity_id} has an invalid ${key}.`,
      )
    }
  }

  if (payload.id !== change.entity_id) {
    throw new Error(
      `Remote sync payload ID ${String(payload.id)} does not match envelope ID ${change.entity_id}.`,
    )
  }

  if (
    typeof payload.revision !== 'number' ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 1 ||
    payload.revision !== change.revision
  ) {
    throw new Error(
      `Remote sync revision for ${change.entity_type}:${change.entity_id} is invalid or does not match the envelope.`,
    )
  }

  if (
    payload.deleted_at !== null &&
    typeof payload.deleted_at !== 'string'
  ) {
    throw new Error(
      `Remote sync payload for ${change.entity_type}:${change.entity_id} has an invalid deleted_at.`,
    )
  }

  if (typeof payload.source_kind !== 'string') {
    throw new Error(
      `Remote sync payload for ${change.entity_type}:${change.entity_id} has an invalid source_kind.`,
    )
  }

  if (
    payload.source_id !== null &&
    typeof payload.source_id !== 'string'
  ) {
    throw new Error(
      `Remote sync payload for ${change.entity_type}:${change.entity_id} has an invalid source_id.`,
    )
  }

  return payload as unknown as MutableEntity
}

function canonicalise_json(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalise_json).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, nested]) =>
        `${JSON.stringify(key)}:${canonicalise_json(nested)}`,
    )

  return `{${entries.join(',')}}`
}

function entities_match(
  local: MutableEntity,
  remote: MutableEntity,
): boolean {
  return canonicalise_json(local) === canonicalise_json(remote)
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

export async function run_pull_sync(
  repository: SyncRepository,
  provider: SyncProvider,
  options: RunPullSyncOptions,
): Promise<RunPullSyncResult> {
  const batch_size = normalise_batch_size(options.batch_size)
  const previous_state =
    (await repository.get_state(provider.id)) ?? initial_state(provider.id)

  await repository.put_state({
    ...previous_state,
    status: 'syncing',
    error: null,
  })

  let received = 0
  let applied = 0
  let skipped = 0
  let conflicts = 0

  try {
    const response = await provider.pull_changes(
      previous_state.pull_cursor,
      batch_size,
    )

    if (response.error !== null) {
      throw new Error(response.error)
    }

    received = response.changes.length

    for (const change of response.changes) {
      const remote = parse_remote_entity(change)
      const local = await repository.get_local_entity(
        change.entity_type,
        change.entity_id,
      )

      if (!local) {
        await repository.apply_remote_entity(
          change.entity_type,
          remote,
          options.now_iso,
        )
        applied += 1
        continue
      }

      if (change.revision < local.revision) {
        skipped += 1
        continue
      }

      if (change.revision === local.revision) {
        if (entities_match(local, remote)) {
          skipped += 1
          continue
        }

        conflicts += 1
        break
      }

      if (
        await repository.has_pending_entity_mutation(
          change.entity_type,
          change.entity_id,
        )
      ) {
        conflicts += 1
        break
      }

      await repository.apply_remote_entity(
        change.entity_type,
        remote,
        options.now_iso,
      )
      applied += 1
    }

    if (conflicts > 0) {
      const error =
        'Remote sync conflict detected. Local unsynced data was preserved and the pull cursor was not advanced.'

      await repository.put_state({
        ...previous_state,
        remote_user_id:
          response.remote_user_id ?? previous_state.remote_user_id,
        status: 'error',
        error,
      })

      return {
        provider: provider.id,
        received,
        applied,
        skipped,
        conflicts,
        cursor: previous_state.pull_cursor,
        status: 'error',
        error,
      }
    }

    await repository.put_state({
      ...previous_state,
      remote_user_id:
        response.remote_user_id ?? previous_state.remote_user_id,
      pull_cursor: response.next_cursor,
      last_pull_at: options.now_iso,
      status: 'idle',
      error: null,
    })

    return {
      provider: provider.id,
      received,
      applied,
      skipped,
      conflicts: 0,
      cursor: response.next_cursor,
      status: 'idle',
      error: null,
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
      received,
      applied,
      skipped,
      conflicts,
      cursor: previous_state.pull_cursor,
      status: 'error',
      error: message,
    }
  }
}

export async function run_sync_cycle(
  repository: SyncRepository,
  provider: SyncProvider,
  options: RunPushSyncOptions & RunPullSyncOptions,
): Promise<RunSyncCycleResult> {
  const push = await run_push_sync(repository, provider, options)

  if (push.status === 'error') {
    return { push, pull: null }
  }

  const pull = await run_pull_sync(repository, provider, options)
  return { push, pull }
}
