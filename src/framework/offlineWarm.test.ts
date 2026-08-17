import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  clearWarmed,
  collectTargets,
  fingerprintOf,
  readWarmed,
  warmAll,
  writeWarmed,
} from './offlineWarm'

const publishedMap = {
  0: ['assets/schemas-DDD.js', 'assets/rng-EEE.js'],
  1: {
    ablation: ['assets/d/ablation-111.js', 0],
    plasma: ['assets/d/plasma-222.js', 1],
  },
  2: ['assets/models-FFF.json'],
} as never

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stubFetch = (impl: (url: string) => Promise<Response> | Response) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(String(input)))),
  )

const ok = (body: unknown) =>
  ({ ok: true, json: () => Promise.resolve(body), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) as Response

describe('collectTargets (#293)', () => {
  it('warms every diversion chunk and the runtime extras', async () => {
    vi.stubGlobal('window', { __diversionAssets: publishedMap })
    stubFetch(() => ok([]))

    const { urls } = await collectTargets('/diversion/')

    expect(urls).toContain('/diversion/assets/d/ablation-111.js')
    expect(urls).toContain('/diversion/assets/d/plasma-222.js')
    // neural-ca's weights are half the download and the reason this is opt-in.
    expect(urls).toContain('/diversion/assets/models-FFF.json')
  })

  it('does NOT re-download the shared deps — they are already precached', async () => {
    vi.stubGlobal('window', { __diversionAssets: publishedMap })
    stubFetch(() => ok([]))

    const { urls } = await collectTargets('/diversion/')

    expect(urls.some((u) => u.includes('schemas-DDD'))).toBe(false)
    expect(urls.some((u) => u.includes('rng-EEE'))).toBe(false)
  })

  it('derives sprite URLs from credits.json the same way pictureStore does', async () => {
    vi.stubGlobal('window', { __diversionAssets: publishedMap })
    stubFetch((url) =>
      url.endsWith('credits.json') ? ok([{ slug: 'axe' }, { slug: 'blue-potion' }]) : ok([]),
    )

    const { urls } = await collectTargets('/diversion/')

    expect(urls).toContain('/diversion/pictures/axe.png')
    expect(urls).toContain('/diversion/pictures/blue-potion.png')
    expect(urls).toContain('/diversion/pictures/credits.json')
  })

  it('still warms the chunks when the sprite manifest fails', async () => {
    // Fail-soft: no manifest means Ablation's bundled pictures are not warmed, not
    // that the whole operation is abandoned.
    vi.stubGlobal('window', { __diversionAssets: publishedMap })
    stubFetch(() => Promise.reject(new Error('offline')))

    const { urls } = await collectTargets('/diversion/')

    expect(urls).toContain('/diversion/assets/d/ablation-111.js')
    expect(urls.some((u) => u.includes('pictures/'))).toBe(false)
  })

  it('returns nothing warmable when the build map was never published', async () => {
    // An old index.html without the #291 script, or a harness. Must not throw.
    vi.stubGlobal('window', {})
    stubFetch(() => ok([]))

    const { urls } = await collectTargets('/diversion/')

    expect(urls.filter((u) => u.includes('assets/'))).toEqual([])
  })
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

describe('warmAll (#293)', () => {
  it('fetches every URL and reports progress as it goes', async () => {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      return ok(null)
    })
    const ticks: number[] = []

    const result = await warmAll(['a', 'b', 'c'], (p) => ticks.push(p.done))

    expect(seen.sort()).toEqual(['a', 'b', 'c'])
    expect(result).toEqual({ done: 3, total: 3, failed: 0 })
    // Progress must actually tick — a bar that only moves at the end is a spinner.
    expect(ticks).toEqual([1, 2, 3])
  })

  it('COUNTS a failure rather than abandoning the rest', async () => {
    // One chunk that moved mid-deploy must not cost the other 137.
    stubFetch((url) => (url === 'b' ? Promise.reject(new Error('404')) : ok(null)))

    const result = await warmAll(['a', 'b', 'c'], () => {})

    expect(result.done).toBe(3)
    expect(result.failed).toBe(1)
  })

  it('counts a non-ok response as a failure too', async () => {
    stubFetch((url) =>
      url === 'b' ? ({ ok: false } as Response) : ok(null),
    )

    expect((await warmAll(['a', 'b'], () => {})).failed).toBe(1)
  })

  it('stops early when cancelled', async () => {
    // 2.1 MB is ~11 s of saturated downlink; cancelling has to actually stop.
    const controller = new AbortController()
    let calls = 0
    stubFetch(() => {
      calls++
      if (calls === 2) controller.abort()
      return ok(null)
    })

    const urls = Array.from({ length: 50 }, (_, i) => `u${i}`)
    const result = await warmAll(urls, () => {}, controller.signal, 1)

    expect(result.done).toBeLessThan(50)
    expect(calls).toBeLessThan(50)
  })

  it('runs several fetches at once, but not all 138', async () => {
    let inFlight = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight--
        return ok(null)
      }),
    )

    await warmAll(Array.from({ length: 40 }, (_, i) => `u${i}`), () => {}, undefined, 6)

    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(6)
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
