import { describe, it, expect, beforeEach, vi } from 'vitest'
import { putImage, getImage, clearImage, currentImage, storeVersion, rehydrate, subscribe, SLOT } from './imageStore'

const img = (id: string) => ({
  id, dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
  pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
})


/** Swap the global `localStorage` binding for a stub, restore it afterwards.
 *
 *  Spying is NOT portable here, and both obvious targets fail somewhere: reads
 *  dispatch through `Storage.prototype` in some jsdom builds and through the
 *  instance in others, so `vi.spyOn(Storage.prototype, ...)` no-ops locally while
 *  `vi.spyOn(localStorage, ...)` no-ops in CI. Either way the spy silently
 *  records nothing, the fail-soft branch never runs, and the test passes without
 *  testing anything. Replacing the binding the module actually reads is the one
 *  approach that works in both. */
function withStorage<T>(fake: Record<string, unknown>, fn: () => T): T {
  vi.stubGlobal('localStorage', fake)
  try {
    return fn()
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('imageStore (#278)', () => {
  beforeEach(() => { localStorage.clear(); clearImage() })

  it('round-trips a put', () => {
    putImage(img('a'))
    expect(getImage('a')?.width).toBe(2)
  })

  it('holds ONE slot — a second put evicts the first', () => {
    putImage(img('a'))
    putImage(img('b'))
    expect(getImage('a')).toBeNull()
    expect(getImage('b')).not.toBeNull()
  })

  it('getImage(undefined) is null, not a throw', () => {
    expect(getImage(undefined)).toBeNull()
  })

  it('version advances on put and on clear', () => {
    const v0 = storeVersion()
    putImage(img('a'))
    const v1 = storeVersion()
    expect(v1).toBeGreaterThan(v0)
    clearImage()
    expect(storeVersion()).toBeGreaterThan(v1)
  })

  it('a put that exceeds quota still serves from memory', () => {
    let attempts = 0
    withStorage({
      setItem: () => { attempts++; throw new Error('QuotaExceededError') },
      getItem: () => null,
      removeItem: () => {},
    }, () => {
      expect(() => putImage(img('a'))).not.toThrow()
    })
    expect(attempts).toBe(1) // the write was genuinely attempted and rejected
    expect(getImage('a')).not.toBeNull() // ...and the in-memory copy still serves
  })

  it('rehydrate survives corrupt JSON', () => {
    localStorage.setItem(SLOT, '{not json')
    expect(() => rehydrate()).not.toThrow()
    expect(getImage('a')).toBeNull()
  })

  it('rehydrate ignores a stale schema version', () => {
    localStorage.setItem(SLOT, JSON.stringify({ v: 0, id: 'a', dataUrl: 'data:,' }))
    expect(() => rehydrate()).not.toThrow()
    expect(getImage('a')).toBeNull()
  })

  it('rehydrate survives localStorage itself throwing', () => {
    let reads = 0
    withStorage({
      getItem: () => { reads++; throw new Error('SecurityError') },
      setItem: () => {},
      removeItem: () => {},
    }, () => {
      expect(() => rehydrate()).not.toThrow()
    })
    expect(reads).toBe(1) // the read was genuinely attempted and threw
    expect(currentImage()).toBeNull()
  })
})

describe('rehydrate gating (#278)', () => {
  beforeEach(() => { localStorage.clear(); clearImage() })

  it('does nothing when an image is already loaded', () => {
    putImage(img('a'))
    expect(currentImage()?.id).toBe('a')
    let reads = 0
    withStorage({
      getItem: () => { reads++; return null },
      setItem: () => {},
      removeItem: () => {},
    }, () => { rehydrate() })
    expect(reads).toBe(0)
  })

  it('reads storage at most once across repeated calls (strict-mode double setup)', () => {
    const payload = JSON.stringify({ v: 1, id: 'a', dataUrl: 'data:,' })
    const reads: string[] = []
    withStorage({
      getItem: (k: string) => { reads.push(k); return payload },
      setItem: () => {},
      removeItem: () => {},
    }, () => {
      rehydrate()
      rehydrate()
      rehydrate()
    })
    expect(reads.filter((k) => k === SLOT)).toHaveLength(1)
  })
})

describe('subscribe (#278)', () => {
  beforeEach(() => { localStorage.clear(); clearImage() })

  it('fires on put and on clear, and stops after unsubscribe', () => {
    let hits = 0
    const off = subscribe(() => { hits++ })
    putImage(img('a'))
    clearImage()
    expect(hits).toBe(2)
    off()
    putImage(img('b'))
    expect(hits).toBe(2)
  })
})
