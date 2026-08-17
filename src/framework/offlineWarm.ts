/** "Keep the whole gallery offline" (#293) — the case the shell-only precache loses.
 *
 *  #289 ships a **shell-only** precache: the app boots offline, but a piece you have
 *  never opened has never been runtime-cached and will not run. That is the right
 *  default — precaching everything costs every first visit 1.7 MB, half of it one
 *  piece's neural-net weights — but "installed it to browse on a flight" is a real
 *  case, and the honest answer is to offer it rather than to spend it on everyone.
 *
 *  This module is deliberately **lazy** (the Gallery imports it on first press), so
 *  none of it, and none of the sprite manifest fetch, is in the entry chunk.
 *
 *  It needs no new caching machinery: warming is `fetch()` of each URL, and the
 *  service worker's existing CacheFirst / StaleWhileRevalidate routes store the
 *  responses. With no service worker at all it degrades to warming the HTTP cache,
 *  which is strictly less durable and still not wrong. */

/** The build-time asset map, republished on `window` by the #291 preload script. It is
 *  the only place in the app that knows every emitted, content-hashed filename. */
interface PublishedAssets {
  0: string[] // shared dep chunk filenames (precached already — not warmed)
  1: Record<string, (string | number)[]> // slug -> [own chunk, ...dep indices]
  2: string[] // runtime-cached extras (neural-ca's weights)
}

declare global {
  interface Window {
    __diversionAssets?: PublishedAssets
  }
}

export interface WarmTargets {
  urls: string[]
  /** A cheap fingerprint of this build's asset set. Content-hashed filenames change on
   *  every deploy that changes anything, so a stored fingerprint that no longer matches
   *  means "the offline copy you took is stale", which the control says out loud rather
   *  than silently re-downloading 1.7 MB on someone's cellular connection. */
  fingerprint: string
}

const SPRITES = 'pictures/credits.json'

/** Everything a viewer needs for all 137 pieces to run with the network off.
 *
 *  Shared deps are deliberately EXCLUDED: they are in the precache already, so warming
 *  them would re-download ~170 kB to no effect. The sprite manifest is fetched rather
 *  than built in, because `public/` is copied verbatim and never appears in the bundle
 *  — and it is fail-soft: no manifest just means Ablation's bundled pictures are not
 *  warmed, not that the whole operation fails. */
export async function collectTargets(base: string, signal?: AbortSignal): Promise<WarmTargets> {
  const published = typeof window === 'undefined' ? undefined : window.__diversionAssets
  const slugs = published?.[1] ?? {}
  const extras = published?.[2] ?? []

  const chunks = Object.values(slugs).map((entry) => String(entry[0]))
  const urls = [...chunks, ...extras].map((f) => base + f)

  try {
    const res = await fetch(base + SPRITES, { signal })
    if (res.ok) {
      // credits.json is an ARRAY of { slug, title, author, ... }; the image is
      // `${slug}.png`, the same derivation `pictureStore.pictureUrl` uses. Reading it
      // rather than importing it keeps `public/` out of the bundle — it is copied
      // verbatim, so it never appears there.
      const credits = (await res.json()) as unknown
      const slugsOf = Array.isArray(credits)
        ? credits
            .map((c) => (c as { slug?: unknown })?.slug)
            .filter((s): s is string => typeof s === 'string')
        : []
      urls.push(base + SPRITES, ...slugsOf.map((s) => `${base}pictures/${s}.png`))
    }
  } catch {
    // No manifest, already offline, or a shape we don't recognise. Warm the rest.
  }

  return { urls, fingerprint: fingerprintOf(chunks, extras) }
}

/** Order-independent, cheap, and changes whenever any content hash does. */
export function fingerprintOf(chunks: string[], extras: string[]): string {
  const all = [...chunks, ...extras].sort().join('\n')
  let h = 2166136261
  for (let i = 0; i < all.length; i++) {
    h ^= all.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${(h >>> 0).toString(36)}:${chunks.length + extras.length}`
}

export interface WarmProgress {
  done: number
  total: number
  failed: number
}

/** Fetch every URL, at most `concurrency` at a time, reporting progress as it goes.
 *
 *  A failed fetch is COUNTED, not thrown: one 404 from a chunk that moved mid-deploy
 *  must not abandon the other 137. The caller decides what a partial result means.
 *  Bounded concurrency because 138 simultaneous requests on a phone is how you get a
 *  browser to start dropping them — and because a visible, steady progress bar is the
 *  point (1.7 MB is ~11 s of saturated downlink on a slow connection; a silent spinner
 *  would be worse than not offering this at all). */
export async function warmAll(
  urls: string[],
  onProgress: (p: WarmProgress) => void,
  signal?: AbortSignal,
  concurrency = 6,
): Promise<WarmProgress> {
  const progress: WarmProgress = { done: 0, total: urls.length, failed: 0 }
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < urls.length) {
      if (signal?.aborted) return
      const url = urls[next++]
      try {
        const res = await fetch(url, { signal })
        if (!res.ok) progress.failed++
        // Drain the body: without it the response may never reach the cache, and the
        // connection stays occupied.
        else await res.arrayBuffer()
      } catch {
        if (signal?.aborted) return
        progress.failed++
      }
      progress.done++
      onProgress({ ...progress })
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
  return { ...progress }
}

const STORE_KEY = 'diversion.offline.v1'

/** What the viewer last warmed, if anything. Fail-soft in every direction: Safari
 *  private mode throws on `localStorage` access itself. */
export function readWarmed(): { fingerprint: string } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fingerprint?: unknown }
    return typeof parsed?.fingerprint === 'string' ? { fingerprint: parsed.fingerprint } : null
  } catch {
    return null
  }
}

export function writeWarmed(fingerprint: string): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ fingerprint }))
  } catch {
    // Quota or a blocked store: the download still happened and is still cached. The
    // only loss is that the control will offer it again.
  }
}

export function clearWarmed(): void {
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    // As above.
  }
}
