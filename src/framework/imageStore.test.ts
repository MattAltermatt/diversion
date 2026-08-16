import { describe, it, expect, beforeEach, vi } from 'vitest'
import { putImage, getImage, clearImage, currentImage, storeVersion, rehydrate, subscribe, SLOT } from './imageStore'

const img = (id: string) => ({
  id, dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
  pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
})

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
    const spy = vi.spyOn(localStorage, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => putImage(img('a'))).not.toThrow()
    expect(spy).toHaveBeenCalled() // the write was genuinely attempted and rejected
    expect(getImage('a')).not.toBeNull() // ...and the in-memory copy still serves
    spy.mockRestore()
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
    const spy = vi.spyOn(localStorage, 'getItem')
      .mockImplementation(() => { throw new Error('SecurityError') })
    expect(() => rehydrate()).not.toThrow()
    expect(spy).toHaveBeenCalled() // the read was genuinely attempted and threw
    expect(currentImage()).toBeNull()
    spy.mockRestore()
  })
})

describe('rehydrate gating (#278)', () => {
  beforeEach(() => { localStorage.clear(); clearImage() })

  it('does nothing when an image is already loaded', () => {
    putImage(img('a'))
    expect(currentImage()?.id).toBe('a')
    const spy = vi.spyOn(localStorage, 'getItem')
    rehydrate()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('reads storage at most once across repeated calls (strict-mode double setup)', () => {
    localStorage.setItem(SLOT, JSON.stringify({ v: 1, id: 'a', dataUrl: 'data:,' }))
    const spy = vi.spyOn(localStorage, 'getItem')
    rehydrate()
    rehydrate()
    rehydrate()
    expect(spy.mock.calls.filter((c) => c[0] === SLOT)).toHaveLength(1)
    spy.mockRestore()
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
