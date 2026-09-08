import type { ProgrammeBlock } from '../../domain/models'

function overlap(
  left: Pick<ProgrammeBlock, 'block_type' | 'start_date_local' | 'end_date_local'>,
  right: Pick<ProgrammeBlock, 'block_type' | 'start_date_local' | 'end_date_local'>,
): boolean {
  if (left.block_type === 'custom' || right.block_type === 'custom') return false
  if (left.block_type !== right.block_type) return false
  if (
    !left.start_date_local ||
    !left.end_date_local ||
    !right.start_date_local ||
    !right.end_date_local
  ) {
    return false
  }

  return (
    left.start_date_local <= right.end_date_local &&
    right.start_date_local <= left.end_date_local
  )
}

export function infer_superseded_programme_block_id(
  incoming: Pick<ProgrammeBlock, 'block_type' | 'start_date_local' | 'end_date_local'>,
  existing_blocks: readonly ProgrammeBlock[],
): string | null {
  return (
    existing_blocks
      .filter(
        (block) =>
          block.deleted_at === null &&
          block.status !== 'archived' &&
          block.status !== 'completed' &&
          overlap(incoming, block),
      )
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]
      ?.id ?? null
  )
}

export function explicitly_supersedes(
  candidate: ProgrammeBlock,
  block_id: string,
): boolean {
  return candidate.supersedes_programme_block_id === block_id
}
