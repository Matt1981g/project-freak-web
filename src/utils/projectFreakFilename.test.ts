import { describe, expect, it } from 'vitest'
import {
  project_freak_filename,
  project_freak_time_stamp,
} from './projectFreakFilename'

describe('PROJECT FREAK file naming', () => {
  it('uses YYYYMMDD_PROFREAK_DESCRIPTION.ext', () => {
    expect(
      project_freak_filename(
        '2026-09-07T17:25:30.000Z',
        'Coach Bridge 2026-09-01 to 2026-09-07',
        '.json',
      ),
    ).toBe('20260907_PROFREAK_COACH_BRIDGE_2026_09_01_TO_2026_09_07.json')
  })

  it('normalises descriptions and extensions safely', () => {
    expect(
      project_freak_filename('2026-09-07', ' safety before restore ', 'JSON'),
    ).toBe('20260907_PROFREAK_SAFETY_BEFORE_RESTORE.json')
  })

  it('extracts a compact time for duplicate-safe backup names', () => {
    expect(project_freak_time_stamp('2026-09-07T17:25:30.000Z')).toBe('172530')
  })
})
