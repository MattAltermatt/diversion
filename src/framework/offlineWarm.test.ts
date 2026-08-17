import { describe, it, expect, vi, afterEach } from 'vitest'
import { collectTargets, verifyCached, warmAll } from './offlineWarm'

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
    // ~1.6 MB is ~10 s of saturated downlink; cancelling has to actually stop.
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
    // ...and the signal must actually reach fetch, or an in-flight multi-megabyte
    // request keeps running after the viewer pressed Cancel.
    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
  })

  it('runs several fetches at once, but not all 165', async () => {
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

describe('collectTargets chunkCount (#293)', () => {
  it('reports how many diversion chunks it found, so the caller can refuse to lie', async () => {
    vi.stubGlobal('window', { __diversionAssets: publishedMap })
    stubFetch(() => ok([{ slug: 'axe' }]))

    const { chunkCount } = await collectTargets('/diversion/')

    expect(chunkCount).toBe(2)
  })

  it('reports ZERO chunks when the map was never published, even though sprites were found', async () => {
    // The reachable trap: an old cached index.html has no #291 script, so only
    // credits.json + the sprites are enumerated. Warming those succeeds and reports
    // no failures — the control would print a green tick over an offline copy that
    // contains not one diversion.
    vi.stubGlobal('window', {})
    stubFetch(() => ok([{ slug: 'axe' }]))

    const { chunkCount, urls } = await collectTargets('/diversion/')

    expect(chunkCount).toBe(0)
    expect(urls.length).toBeGreaterThan(0) // sprites were still found
  })
})

describe('verifyCached (#293)', () => {
  it('confirms the fetches actually landed in a cache', async () => {
    vi.stubGlobal('caches', { match: vi.fn().mockResolvedValue(new Response('')) })
    expect(await verifyCached(['a', 'b', 'c'])).toBe(true)
  })

  it('reports FALSE when nothing was stored — no SW controlling, or a quota eviction', async () => {
    // Everything about this feature rests on the service worker having stored what we
    // fetched. In dev, before clientsClaim, or after an eviction, it did not.
    vi.stubGlobal('caches', { match: vi.fn().mockResolvedValue(undefined) })
    expect(await verifyCached(['a', 'b', 'c'])).toBe(false)
  })

  it('reports FALSE rather than throwing where Cache Storage does not exist', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await verifyCached(['a'])).toBe(false)
  })

  it('samples rather than checking all 165', async () => {
    const match = vi.fn().mockResolvedValue(new Response(''))
    vi.stubGlobal('caches', { match })
    await verifyCached(Array.from({ length: 165 }, (_, i) => `u${i}`), 5)
    expect(match.mock.calls.length).toBeLessThanOrEqual(5)
  })
})
