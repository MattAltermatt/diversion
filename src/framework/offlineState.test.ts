import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  clearWarmed,
  currentFingerprint,
  fingerprintOf,
  publishedAssets,
  readWarmed,
  writeWarmed,
} from './offlineState'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fingerprintOf (#293)', () => {
  it('changes when any content hash changes — that is what makes a copy stale', () => {
    const a = fingerprintOf(['assets/d/ablation-111.js'], ['assets/models-FFF.json'])
    const b = fingerprintOf(['assets/d/ablation-999.js'], ['assets/models-FFF.json'])
    expect(a).not.toBe(b)
  })

  it('is order-independent, so a map reordering is not mistaken for a deploy', () => {
    expect(fingerprintOf(['a.js', 'b.js'], [])).toBe(fingerprintOf(['b.js', 'a.js'], []))
  })
})

describe('currentFingerprint (#293)', () => {
  it('derives this build\u2019s fingerprint from the published map, with no network', () => {
    vi.stubGlobal('window', {
      __diversionAssets: {
        0: ['assets/schemas-DDD.js'],
        1: { ablation: ['assets/d/ablation-111.js', 0] },
        2: ['assets/models-FFF.json'],
      },
    })
    expect(currentFingerprint()).toBe(
      fingerprintOf(['assets/d/ablation-111.js'], ['assets/models-FFF.json']),
    )
  })

  it('is null when the map was never published — an old cached index.html', () => {
    // The control must be able to tell "nothing saved" from "saved and current".
    vi.stubGlobal('window', {})
    expect(currentFingerprint()).toBeNull()
    expect(publishedAssets()).toBeUndefined()
  })
})

describe('warmed-state store (#293)', () => {
  it('round-trips a fingerprint', () => {
    writeWarmed('abc:138')
    expect(readWarmed()).toEqual({ fingerprint: 'abc:138' })
    clearWarmed()
    expect(readWarmed()).toBeNull()
  })

  it('returns null rather than throwing on corrupt or hostile storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readWarmed()).toBeNull()
    // The download still happened and is still cached; only the memory of it is lost.
    expect(() => writeWarmed('x')).not.toThrow()
    expect(() => clearWarmed()).not.toThrow()
  })

  it('ignores a stored value of the wrong shape', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ fingerprint: 42 }) })
    expect(readWarmed()).toBeNull()
  })
})
