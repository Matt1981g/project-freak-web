import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parse_historical_workbook } from './parser'
import { REQUIRED_SET_DATA_COLUMNS } from './profile'

function workbook_fixture(): ArrayBuffer {
  const workbook = XLSX.utils.book_new()

  const set_rows = [
    [...REQUIRED_SET_DATA_COLUMNS],
    [
      'W01',
      46193,
      'Sat',
      '08:30',
      '10:30',
      1,
      'Nautilus Biceps Curl',
      1,
      25,
      'normal',
      'failure',
      '13F',
      13,
      null,
      null,
      13,
      1,
      9,
      9,
      9,
      null,
      null,
      325,
      'load × primary reps',
      null,
      'Verified',
      'Fixture',
    ],
    [
      'W01',
      46193,
      'Sat',
      '08:30',
      '10:30',
      2,
      'Lateral Raise',
      1,
      16,
      'normal',
      'drop',
      '16 + 4 drop @12kg',
      16,
      12,
      4,
      20,
      0,
      10,
      9,
      7,
      null,
      null,
      304,
      'primary + secondary component',
      null,
      'Verified',
      'Fixture',
    ],
    [
      'W01',
      46193,
      'Sat',
      '08:30',
      '10:30',
      3,
      'Rear Delt',
      1,
      56,
      'normal',
      'partials',
      '16 + 8 partials',
      16,
      56,
      8,
      16,
      0,
      10,
      9,
      9,
      null,
      null,
      896,
      'primary full reps only; partials excluded',
      null,
      'Verified',
      'Fixture',
    ],
    [
      'W01',
      46193,
      'Sat',
      '08:30',
      '10:30',
      4,
      'Plate Pinch',
      1,
      10,
      'normal',
      'straight',
      '60s',
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'Verified',
      'Fixture',
    ],
    [
      'W01',
      46193,
      'Sat',
      '08:30',
      '10:30',
      5,
      'Single-arm ISO lat pulldown',
      1,
      50,
      'normal',
      'failure',
      '11F L + 11F R',
      22,
      null,
      null,
      22,
      1,
      9,
      9,
      9,
      null,
      null,
      1100,
      'load × primary reps',
      null,
      'Verified',
      'Fixture',
    ],
  ]

  const summary_rows = [
    [
      'Workout ID',
      'Date',
      'Day',
      'Start',
      'Finish',
      'Exercises',
      'Working Sets',
      'Completed Reps',
      'Total Recorded Load',
      'Avg RPE',
      'Avg Pump',
      'Avg Form',
      'Data Notes',
    ],
    ['W01', 46193, 'Sat', '08:30', '10:30', 5, 5, 71, 2625, null, null, null, null],
  ]

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(set_rows),
    'Set Data',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(summary_rows),
    'Session Summary',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Exercise']]),
    'Exercise Summary',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Issue / rule', 'Handling in export']]),
    'Data Audit',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['PROJECT FREAK', null]]),
    'README',
  )

  return XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer
}

describe('parse_historical_workbook', () => {
  it('preserves set semantics without inventing intensifier data', async () => {
    const preview = await parse_historical_workbook(
      workbook_fixture(),
      'fixture.xlsx',
    )

    expect(preview.can_commit).toBe(true)
    expect(preview.detected).toMatchObject({
      sessions: 1,
      session_exercises: 5,
      exact_exercise_labels: 5,
      sets: 5,
    })

    const failure = preview.rows[0]
    expect(failure.primary_reps_completed).toBe(13)
    expect(failure.completed_reps).toBe(13)
    expect(failure.failure_status).toBe('attempted_next_rep_failed')
    expect(failure.structure_type).toBe('straight')

    const drop = preview.rows[1]
    expect(drop.structure_type).toBe('drop')
    expect(drop.secondary_load_kg).toBe(12)
    expect(drop.secondary_reps).toBe(4)

    const partials = preview.rows[2]
    expect(partials.partial_reps).toBe(8)
    expect(partials.source_set_load_kg_reps).toBe(896)

    const timed = preview.rows[3]
    expect(timed.rep_mode).toBe('timed')
    expect(timed.duration_seconds).toBe(60)
    expect(timed.completed_reps).toBeNull()

    const unilateral = preview.rows[4]
    expect(unilateral.rep_mode).toBe('per_side')
    expect(unilateral.left_reps_completed).toBe(11)
    expect(unilateral.right_reps_completed).toBe(11)
    expect(unilateral.left_failure_status).toBe(
      'attempted_next_rep_failed',
    )
    expect(unilateral.right_failure_status).toBe(
      'attempted_next_rep_failed',
    )
  })

  it('marks a noncanonical but structurally valid workbook with a warning', async () => {
    const preview = await parse_historical_workbook(
      workbook_fixture(),
      'fixture.xlsx',
    )

    expect(preview.is_canonical_source).toBe(false)
    expect(
      preview.issues.some((entry) => entry.code === 'noncanonical_workbook'),
    ).toBe(true)
    expect(
      preview.issues.some((entry) => entry.severity === 'error'),
    ).toBe(false)
  })
})
