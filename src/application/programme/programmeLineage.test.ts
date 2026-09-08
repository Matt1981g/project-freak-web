import { describe, expect, it } from 'vitest'
import type { ProgrammeBlock } from '../../domain/models'
import {
  explicitly_supersedes,
  infer_superseded_programme_block_id,
} from './programmeLineage'

const base = {
  created_at: '2026-09-04T12:00:00.000Z',
  updated_at: '2026-09-04T12:00:00.000Z',
  deleted_at: null,
  revision: 1,
  device_id: 'device',
  source_kind: 'programme_import' as const,
  source_id: null,
  name: 'week',
  block_type: 'microcycle' as const,
  start_date_local: '2026-09-07',
  end_date_local: '2026-09-12',
  status: 'draft' as const,
  goal: null,
  notes: null,
}

function block(id: string, created_at: string): ProgrammeBlock {
  return { ...base, id, created_at, updated_at: created_at }
}

describe('programme lineage', () => {
  it('links a replacement to the newest active overlapping programme', () => {
    const older = block('older', '2026-09-03T12:00:00.000Z')
    const newer = block('newer', '2026-09-04T12:00:00.000Z')

    expect(
      infer_superseded_programme_block_id(base, [older, newer]),
    ).toBe('newer')
  })

  it('does not invent lineage for custom or non-overlapping programmes', () => {
    expect(
      infer_superseded_programme_block_id(
        { ...base, block_type: 'custom' },
        [block('old', '2026-09-04T12:00:00.000Z')],
      ),
    ).toBeNull()

    expect(
      infer_superseded_programme_block_id(
        { ...base, start_date_local: '2026-10-01', end_date_local: '2026-10-07' },
        [block('old', '2026-09-04T12:00:00.000Z')],
      ),
    ).toBeNull()
  })

  it('recognises explicit replacement independently of creation-time heuristics', () => {
    const candidate: ProgrammeBlock = {
      ...block('replacement', '2026-09-01T12:00:00.000Z'),
      supersedes_programme_block_id: 'old',
    }
    expect(explicitly_supersedes(candidate, 'old')).toBe(true)
  })
})
