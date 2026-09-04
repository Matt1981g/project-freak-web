import { describe, expect, it } from 'vitest'
import {
  AUTO_SYNC_MIN_GAP_MS,
  should_attempt_auto_sync,
} from './autoSyncPolicy'

describe('auto sync policy', () => {
  const ready = {
    configured: true,
    signed_in: true,
    online: true,
    visible: true,
    now_ms: 100_000,
    last_attempt_ms: null,
  }

  it('requires configured, signed-in, online and visible state', () => {
    expect(should_attempt_auto_sync(ready)).toBe(true)
    expect(
      should_attempt_auto_sync({ ...ready, configured: false }),
    ).toBe(false)
    expect(
      should_attempt_auto_sync({ ...ready, signed_in: false }),
    ).toBe(false)
    expect(should_attempt_auto_sync({ ...ready, online: false })).toBe(false)
    expect(should_attempt_auto_sync({ ...ready, visible: false })).toBe(false)
  })

  it('debounces ordinary foreground triggers', () => {
    expect(
      should_attempt_auto_sync({
        ...ready,
        last_attempt_ms: ready.now_ms - AUTO_SYNC_MIN_GAP_MS + 1,
      }),
    ).toBe(false)

    expect(
      should_attempt_auto_sync({
        ...ready,
        last_attempt_ms: ready.now_ms - AUTO_SYNC_MIN_GAP_MS,
      }),
    ).toBe(true)
  })

  it('allows an explicit event trigger to bypass the debounce', () => {
    expect(
      should_attempt_auto_sync({
        ...ready,
        last_attempt_ms: ready.now_ms - 1_000,
        force: true,
      }),
    ).toBe(true)
  })
})
