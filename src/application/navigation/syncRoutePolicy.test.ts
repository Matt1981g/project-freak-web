import { describe, expect, it } from 'vitest'
import { should_remount_route_after_sync, should_show_daily_session_prompt } from './syncRoutePolicy'

describe('PF19.1 sync navigation stability', () => {
  it('preserves active gym editor on incoming remote updates', () => {
    expect(should_remount_route_after_sync('/gyms', 5)).toBe(false)
  })

  it('never remounts a live workout to apply background changes', () => {
    expect(should_remount_route_after_sync('/workout/abc', 2)).toBe(false)
  })

  it('allows read-only pages to refresh when remote data actually arrived', () => {
    expect(should_remount_route_after_sync('/history', 3)).toBe(true)
    expect(should_remount_route_after_sync('/history', 0)).toBe(false)
  })

  it('only allows the start/resume prompt on the Plan screen', () => {
    expect(should_show_daily_session_prompt('/plan')).toBe(true)
    for (const path of ['/gyms', '/history', '/sync', '/backup', '/workout/abc']) {
      expect(should_show_daily_session_prompt(path)).toBe(false)
    }
  })
})
