import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentInterfaceMode } from './interfaceMode'

// Regression guard: Old School is an opt-in-to-simplification default,
// while returning to Analytics must preserve the legacy programme path.
describe('Project FREAK workout interface selection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to Old School without a saved preference', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(currentInterfaceMode()).toBe('old-school')
  })

  it('honours a saved Analytics preference', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'analytics' })
    expect(currentInterfaceMode()).toBe('analytics')
  })

  it('fails safely to Old School if device storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage temporarily unavailable') },
    })
    expect(currentInterfaceMode()).toBe('old-school')
  })
})
