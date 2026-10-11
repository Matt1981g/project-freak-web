/**
 * Cross-tab mutex for operations touching the shared browser dataset.
 *
 * Web Locks are origin-wide: separate PF tabs share this lock, while
 * IndexedDB transactions alone cannot serialize network round trips.
 * This module intentionally fails closed if Web Locks are unavailable.
 *
 * Workout/set writes are not yet required to take this lock. A guarded
 * restore is therefore only one release prerequisite, not a guarantee
 * that other tabs cannot log workouts while restoring. That broader
 * maintenance/UX gate is tracked separately.
 */

export const PF_DATA_OPERATION_LOCK_PREFIX = 'project-freak:dataset-operation'

export type DatasetOperation =
  | 'cloud sync'
  | 'restore'
  | 'configure cloud'
  | 'clear cloud'
  | 'sign in'
  | 'sign up'
  | 'sign out'
  | 'link cloud account'

export class DatasetOperationUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatasetOperationUnavailableError'
  }
}

export function dataset_operation_lock_name(database_name: string): string {
  if (!database_name.trim()) {
    throw new Error('A database name is required for cross-tab coordination.')
  }
  return `${PF_DATA_OPERATION_LOCK_PREFIX}:${database_name}`
}

/**
 * An unavailable lock rejects rather than queuing potentially stale work.
 * A caller should retry explicitly after the other tab finishes.
 *
 * The injected lock manager is used only for deterministic concurrency tests.
 * Production always resolves navigator.locks at the instant of acquisition.
 */
export async function with_dataset_operation_lock<T>(
  database_name: string,
  operation: DatasetOperation,
  task: () => Promise<T>,
  test_lock_manager?: LockManager | null,
): Promise<T> {
  const locks = test_lock_manager === undefined
    ? (typeof navigator === 'undefined' ? undefined : navigator.locks)
    : test_lock_manager

  if (!locks || typeof locks.request !== 'function') {
    throw new DatasetOperationUnavailableError(
      `Cannot ${operation} safely: this browser does not support cross-tab Web Locks. ` +
      'Do not restore or switch cloud accounts in this browser; keep your backup.',
    )
  }

  return locks.request(
    dataset_operation_lock_name(database_name),
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) {
        throw new DatasetOperationUnavailableError(
          `Cannot ${operation}: another PF tab is syncing or changing the dataset. ` +
          'Wait for it to finish, then try again.',
        )
      }
      return task()
    },
  )
}
