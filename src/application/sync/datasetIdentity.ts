import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import type { Setting } from '../../domain/models'

/**
 * Device-local, backed-up identity for this *existing* IndexedDB dataset.
 * Never cloud-sync or auto-infer ownership from a newly supplied JWT.
 *
 * This is a fail-closed sync boundary, NOT a multi-account local database:
 * until profile-scoped stores/UI are implemented, only one linked account
 * may use this origin. Signing out leaves its data on the device.
 */
export const DATASET_OWNER_SETTING_KEY = 'pf:dataset:cloud-owner:v1'

export interface DatasetCloudOwner {
  project_url: string
  user_id: string
  linked_at: string
}

export type DatasetBindingState =
  | 'unbound'
  | 'matched'
  | 'signed_out'
  | 'mismatch'

export function normalize_dataset_project_url(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash) {
    throw new Error('Dataset owner requires an HTTPS project URL without credentials or query parameters.')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  if (path && path !== '/') {
    throw new Error('Dataset owner URL must identify the project origin, not a URL path.')
  }
  return parsed.origin
}

function owner_from_setting(row: Setting | undefined): DatasetCloudOwner | null {
  if (!row) return null
  const value = row.value_json
  if (row.scope !== 'device' || !value || Array.isArray(value) ||
      typeof value !== 'object') {
    throw new Error('Stored dataset owner is invalid. Sync is disabled; keep your backup.')
  }
  const { project_url, user_id, linked_at } = value
  if (
    typeof project_url !== 'string' ||
    typeof user_id !== 'string' || !user_id.trim() ||
    typeof linked_at !== 'string' || !Number.isFinite(Date.parse(linked_at))
  ) {
    throw new Error('Stored dataset owner is damaged. Sync is disabled; keep your backup.')
  }
  try {
    if (normalize_dataset_project_url(project_url) !== project_url) {
      throw new Error('Noncanonical owner URL')
    }
  } catch {
    throw new Error('Stored dataset owner URL is invalid. Sync is disabled; keep your backup.')
  }
  return { project_url, user_id, linked_at }
}

export async function get_dataset_cloud_owner(
  db: ProjectFreakDatabase,
): Promise<DatasetCloudOwner | null> {
  return owner_from_setting(await db.settings.get(DATASET_OWNER_SETTING_KEY))
}

export function evaluate_dataset_binding(
  owner: DatasetCloudOwner | null,
  project_url: string | null,
  user_id: string | null,
): DatasetBindingState {
  if (!owner) return 'unbound'
  if (!project_url || !user_id) return 'signed_out'
  return owner.project_url === normalize_dataset_project_url(project_url) &&
    owner.user_id === user_id
    ? 'matched'
    : 'mismatch'
}

export async function assert_dataset_account_compatible(
  db: ProjectFreakDatabase,
  project_url: string,
  user_id: string,
): Promise<void> {
  const owner = await get_dataset_cloud_owner(db)
  if (owner && evaluate_dataset_binding(owner, project_url, user_id) !== 'matched') {
    throw new Error(
      'This browser contains training data linked to a different Supabase account or project. ' +
      'Sign in to the original account; use a separate browser profile for other accounts. ' +
      'No local data has been deleted.',
    )
  }
}

export async function require_dataset_cloud_owner(
  db: ProjectFreakDatabase,
  project_url: string,
  user_id: string,
): Promise<DatasetCloudOwner> {
  const owner = await get_dataset_cloud_owner(db)
  if (!owner) {
    throw new Error(
      'Cloud sync paused: this local training dataset is not linked to an account. ' +
      'Go to Cloud Sync and confirm LINK THIS DATASET after checking the account and project.',
    )
  }
  await assert_dataset_account_compatible(db, project_url, user_id)
  return owner
}

/**
 * Explicit user-initiated link only, committed via a single transaction.
 * A prior sync_state remote_user_id is historical evidence: if it differs
 * we must not silently relink or upload another account's data.
 */
export async function link_dataset_cloud_owner(
  db: ProjectFreakDatabase,
  project_url: string,
  user_id: string,
  linked_at: string,
): Promise<DatasetCloudOwner> {
  const normalized_url = normalize_dataset_project_url(project_url)
  if (!user_id.trim() || !Number.isFinite(Date.parse(linked_at))) {
    throw new Error('A valid authenticated account and timestamp are required.')
  }

  return db.transaction('rw', db.settings, db.sync_state, async () => {
    const existing = owner_from_setting(await db.settings.get(DATASET_OWNER_SETTING_KEY))
    if (existing) {
      if (evaluate_dataset_binding(existing, normalized_url, user_id) !== 'matched') {
        throw new Error('This dataset is already linked to another account. Link refused.')
      }
      return existing
    }

    const previous_sync = await db.sync_state.get('supabase')
    if (previous_sync?.remote_user_id && previous_sync.remote_user_id !== user_id) {
      throw new Error(
        'This dataset was previously synced with a different account. ' +
        'Linking refused; keep your backup and recover the original account.',
      )
    }

    const owner: DatasetCloudOwner = {
      project_url: normalized_url,
      user_id,
      linked_at,
    }
    await db.settings.add({
      key: DATASET_OWNER_SETTING_KEY,
      scope: 'device',
      value_json: { ...owner },
      updated_at: linked_at,
      device_id: null,
    })
    return owner
  })
}
