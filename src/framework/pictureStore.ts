// Pixels for the BUNDLED picture set. Deliberately a separate store from
// `imageStore`, which owns one localStorage slot holding the viewer's own upload:
// routing a rotation through that slot would overwrite an upload the viewer
// expects to still be there, every time the picture changed.
//
// Everything here is in-memory only. A bundled scene is a static asset the
// browser already HTTP-caches, so re-fetching after a reload costs nothing and
// persistence would buy nothing. Keys are stable slugs, so — unlike the upload
// lane — there is no id-cannot-survive-reload problem to work around, and no
// `currentImage()`-style fallback to reason about.
//
// Every path is fail-soft: a 404, a rejected fetch, or an undecodable payload
// leaves the slot empty and the diversion falls back to its contour map. Nothing
// here may throw inside a render or a synchronous framework hook.
import { decodeToPixels, type StoredImage } from './imageStore'

const cache = new Map<string, StoredImage>()
/** Slugs with a fetch in flight. A failed slug is REMOVED rather than remembered,
 *  so a later call retries — a transient offline blip must not blacklist a scene
 *  for the rest of the session. `cache` is what makes the success case fetch
 *  exactly once. */
const inFlight = new Set<string>()
let version = 1
const listeners = new Set<() => void>()

export function pictureVersion(): number {
  return version
}

/** Subscribe to arrivals. Exists for React controls; diversions compare
 *  `pictureVersion()` inside their own frame loop instead. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function bump(): void {
  version++
  for (const fn of listeners) fn()
}

/** BASE_URL-relative, so it resolves under the `/diversion/` production base as
 *  well as at the dev-server root. */
export function pictureUrl(slug: string): string {
  return `${import.meta.env.BASE_URL}pictures/${slug}.png`
}

export function getPicture(slug: string): StoredImage | null {
  return cache.get(slug) ?? null
}

/** Fire-and-forget fetch + decode. Safe to call every frame: a cached or in-flight
 *  slug returns immediately without touching the network — though note it is
 *  called once per PICTURE, not per frame: the only call site is `resolveImage`,
 *  reachable via `newPicture`.
 *
 *  Returns the settle promise purely so tests can await completion deterministically
 *  — it never rejects, and production callers ignore it. Without this a fail-soft
 *  test can only guess at how many ticks the chain needs, and "the slot is still
 *  empty" passes trivially by checking before the error path has run at all. */
export function ensurePicture(slug: string): Promise<void> {
  if (cache.has(slug) || inFlight.has(slug)) return Promise.resolve()
  inFlight.add(slug)
  // The whole chain is wrapped so a synchronous throw from `fetch` itself (rather
  // than a rejected promise) still cannot escape into a caller's render.
  try {
    return fetch(pictureUrl(slug))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blobToDataUrl)
      // `keepDataUrl` — the payload is already at bundle resolution, so re-encoding
      // it through a canvas would be pure waste.
      .then((dataUrl) => decodeToPixels(dataUrl, true))
      .then((img) => {
        // The slug becomes the id, so `quantKey` stays stable per scene and a
        // rotation step reliably invalidates the previous quantization.
        // Drop the data URL. `imageStore` keeps it because it writes it to
        // localStorage; this store persists nothing, so retaining it is pure
        // waste — trivial at sprite sizes, ~700KB per entry at MAX_EDGE.
        cache.set(slug, { ...img, id: slug, dataUrl: '' })
        bump()
      })
      .catch(() => { /* stay on the contour map */ })
      .finally(() => { inFlight.delete(slug) })
  } catch {
    inFlight.delete(slug)
    return Promise.resolve()
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('read failed'))
    r.onload = () => resolve(String(r.result))
    r.readAsDataURL(blob)
  })
}

/** Test-only. Module state would otherwise leak between cases. */
export function __resetPictureStore(): void {
  cache.clear()
  inFlight.clear()
  listeners.clear()
  version = 1
}
