import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensurePicture, getPicture, pictureUrl, pictureVersion, subscribe, __resetPictureStore,
} from './pictureStore'

// jsdom cannot decode a real PNG, so the decode is stubbed at the module seam.
vi.mock('./imageStore', async (orig) => ({
  ...(await orig<typeof import('./imageStore')>()),
  decodeToPixels: vi.fn(async (dataUrl: string) => {
    if (dataUrl.includes('bad')) throw new Error('decode failed')
    return { id: 'x', dataUrl, width: 4, height: 4, pixels: new Uint8ClampedArray(64) }
  }),
}))

function stubFetch(impl: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((u: string) => impl(String(u))))
}
function fetchCalls(): unknown[] {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls
}

const ok = (body = 'good') =>
  Promise.resolve({ ok: true, blob: async () => new Blob([body]) } as unknown as Response)

beforeEach(() => {
  __resetPictureStore()
  // A spy on localStorage is not portable across jsdom builds — stub the global.
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(),
  })
  vi.stubGlobal('FileReader', class {
    result = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    readAsDataURL(b: Blob) {
      void b.text().then((t) => {
        this.result = `data:image/png;base64,${t}`
        this.onload?.()
      })
    }
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('pictureUrl', () => {
  it('builds a BASE_URL-relative path under pictures/<slug>.png', () => {
    expect(pictureUrl('pine-ridge')).toMatch(/pictures\/pine-ridge\.png$/)
  })
})

describe('ensurePicture', () => {
  it('fetches, decodes, stores under the slug and bumps the version', async () => {
    stubFetch(() => ok())
    const before = pictureVersion()
    ensurePicture('pine-ridge')
    await vi.waitFor(() => expect(getPicture('pine-ridge')).not.toBeNull())
    expect(pictureVersion()).toBeGreaterThan(before)
    expect(getPicture('pine-ridge')!.width).toBe(4)
    // The slug IS the id, so `quantKey` stays stable per scene.
    expect(getPicture('pine-ridge')!.id).toBe('pine-ridge')
  })

  it('notifies subscribers when a picture lands', async () => {
    stubFetch(() => ok())
    const seen = vi.fn()
    const off = subscribe(seen)
    ensurePicture('pine-ridge')
    await vi.waitFor(() => expect(seen).toHaveBeenCalled())
    off()
  })

  it('fetches each slug once even when called every frame', async () => {
    stubFetch(() => ok())
    for (let i = 0; i < 50; i++) ensurePicture('pine-ridge')
    await vi.waitFor(() => expect(getPicture('pine-ridge')).not.toBeNull())
    for (let i = 0; i < 50; i++) ensurePicture('pine-ridge')
    expect(fetchCalls()).toHaveLength(1)
  })

  // Each of these AWAITS the settle promise before asserting. Checking the slot
  // earlier passes trivially — the chain has not reached its error path yet — and
  // a mutation that stored garbage on failure would survive.
  it('is fail-soft on a 404: no throw, slot stays empty', async () => {
    stubFetch(() => Promise.resolve({ ok: false, status: 404 } as Response))
    let settle!: Promise<void>
    expect(() => { settle = ensurePicture('missing') }).not.toThrow()
    await settle
    expect(fetchCalls()).toHaveLength(1)
    expect(getPicture('missing')).toBeNull()
  })

  it('is fail-soft on a rejected fetch', async () => {
    stubFetch(() => Promise.reject(new Error('offline')))
    let settle!: Promise<void>
    expect(() => { settle = ensurePicture('offline') }).not.toThrow()
    await settle
    expect(getPicture('offline')).toBeNull()
  })

  it('is fail-soft on an undecodable payload', async () => {
    stubFetch(() => ok('bad'))
    await ensurePicture('bad')
    expect(getPicture('bad')).toBeNull()
  })

  it('retries a slug whose first attempt failed', async () => {
    stubFetch(() => Promise.resolve({ ok: false, status: 500 } as Response))
    await ensurePicture('flaky')
    expect(getPicture('flaky')).toBeNull()

    // Poll rather than assume the failed attempt has already cleared its in-flight
    // marker — the point under test is that a LATER call retries, not that it
    // retries on any particular tick.
    stubFetch(() => ok())
    await vi.waitFor(() => {
      ensurePicture('flaky')
      expect(getPicture('flaky')).not.toBeNull()
    })
  })

  it('NEVER writes localStorage — that slot belongs to the viewer upload', async () => {
    stubFetch(() => ok())
    ensurePicture('pine-ridge')
    await vi.waitFor(() => expect(getPicture('pine-ridge')).not.toBeNull())
    expect(localStorage.setItem).not.toHaveBeenCalled()
    expect(localStorage.removeItem).not.toHaveBeenCalled()
    expect(localStorage.clear).not.toHaveBeenCalled()
  })
})

describe('getPicture', () => {
  it('returns null for a slug never requested', () => {
    expect(getPicture('nope')).toBeNull()
  })
})
