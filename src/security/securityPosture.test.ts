import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'

describe('web security posture', () => {
  it('keeps a self-only script policy with no third-party script tags', () => {
    expect(indexHtml).toContain("script-src 'self'")
    expect(indexHtml).toContain("object-src 'none'")
    expect(indexHtml).toContain("frame-ancestors 'none'")

    const scriptSources = Array.from(
      indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
      (match) => match[1],
    )

    expect(scriptSources.length).toBeGreaterThan(0)
    expect(
      scriptSources.every(
        (source) =>
          source.startsWith('/') ||
          source.startsWith('./') ||
          source.startsWith('../'),
      ),
    ).toBe(true)
  })

  it('limits production network access to self and Supabase', () => {
    const csp = indexHtml.match(/Content-Security-Policy[\s\S]*?content="([^"]+)"/)?.[1]

    expect(csp).toBeTruthy()
    expect(csp).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    )
    expect(csp).not.toContain("connect-src *")
    expect(csp).not.toContain('script-src https:')
  })
})
