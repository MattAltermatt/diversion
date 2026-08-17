import { fingerprintOf, publishedAssets } from './offlineState'

/** "Keep the whole gallery offline" (#293) — the case the shell-only precache loses.
 *
 *  #289 ships a **shell-only** precache: the app boots offline, but a piece you have
 *  never opened has never been runtime-cached and will not run. That is the right
 *  default — precaching everything costs every first visit ~1.6 MB, more than half of
 *  it one piece's neural-net weights — but "installed it to browse on a flight" is a
 *  real case, and the honest answer is to offer it rather than to spend it on everyone.
 *
 *  This module is the ENGINE, and it must stay reachable only through `await import()`
 *  — see `offlineState.ts` for why that is a mechanical constraint rather than a
 *  preference, and for the guard that keeps it true.
 *
 *  It needs no new caching machinery: warming is `fetch()` of each URL, and the
 *  service worker's existing CacheFirst / StaleWhileRevalidate routes store the
 *  responses. `verifyCached` is what turns that from an assumption into a check. */

export interface WarmTargets {
  urls: string[]
  /** How many of `urls` are diversion chunks. Zero means the build map was never
   *  published and only the sprites were found — a state the caller must NOT report
   *  as success, because not one piece would have been made available offline. */
  chunkCount: number
  /** A cheap fingerprint of this build's asset set, for detecting a stale copy. */
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
  const published = publishedAssets()
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

  return { urls, chunkCount: chunks.length, fingerprint: fingerprintOf(chunks, extras) }
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
 *  Bounded concurrency because 165 simultaneous requests on a phone is how you get a
 *  browser to start dropping them — and because a visible, steady progress bar is the
 *  point (~1.6 MB is ~10 s of saturated downlink on a slow connection; a silent
 *  spinner would be worse than not offering this at all). */
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

/** Did any of this actually land in a durable cache?
 *
 *  The whole feature rests on an assumption — that the service worker's runtime routes
 *  stored what we fetched — and that assumption is false in several reachable states:
 *  no SW is controlling the document yet, the SW was never installed (dev), or the
 *  quota handler evicted mid-warm. In every one of those the fetches succeed and the
 *  UI would print a green tick over an offline copy that does not exist. So check a
 *  sample rather than infer it: `caches.match` searches every cache on the origin.
 *
 *  Sampled, not exhaustive — 165 `caches.match` calls to confirm what one can tell us
 *  is not worth the latency. */
export async function verifyCached(urls: string[], sample = 5): Promise<boolean> {
  if (typeof caches === 'undefined' || urls.length === 0) return false
  const step = Math.max(1, Math.floor(urls.length / sample))
  const picks = urls.filter((_, i) => i % step === 0).slice(0, sample)
  try {
    const hits = await Promise.all(picks.map((u) => caches.match(u)))
    return hits.some(Boolean)
  } catch {
    return false
  }
}
