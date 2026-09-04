import { afterEach, describe, expect, it, vi } from 'vitest'
import { create_uuid } from './uuid'

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('create_uuid', () => {
  const original_crypto = globalThis.crypto

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: original_crypto,
    })
    vi.restoreAllMocks()
  })

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi
      .fn()
      .mockReturnValue('11111111-1111-4111-8111-111111111111')

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID },
    })

    expect(create_uuid()).toBe('11111111-1111-4111-8111-111111111111')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('falls back to getRandomValues and still creates a UUID v4', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues(bytes: Uint8Array) {
          bytes.fill(0x11)
          return bytes
        },
      },
    })

    expect(create_uuid()).toMatch(UUID_V4)
  })

  it('still creates a UUID-shaped identifier with no crypto API', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    })

    expect(create_uuid()).toMatch(UUID_V4)
  })
})
