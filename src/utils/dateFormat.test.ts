import { describe, expect, it } from 'vitest'
import { format_local_date_display } from './dateFormat'

describe('format_local_date_display', () => {
  it('formats ISO local dates as DD/MM/YYYY without timezone conversion', () => {
    expect(format_local_date_display('2026-09-05')).toBe('05/09/2026')
  })

  it('preserves unknown text and supports a missing-date fallback', () => {
    expect(format_local_date_display('legacy date')).toBe('legacy date')
    expect(format_local_date_display(null, 'Unscheduled')).toBe('Unscheduled')
  })
})
