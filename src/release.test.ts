import { describe, expect, it } from 'vitest'
import package_metadata from '../package.json'
import { PF_RELEASE_VERSION } from './release'

describe('canonical Project Freak release', () => {
  it('derives the displayed and exported release from package metadata', () => {
    const [major, minor] = package_metadata.version.split('.')
    expect(PF_RELEASE_VERSION).toBe(`V${major}.${minor}`)
  })
})
