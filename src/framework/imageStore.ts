// Pixels for an uploaded picture. They live HERE, not in the config: a config
// travels through the URL codec and through `update()` diffing on every slider
// drag, and neither wants a megabyte of base64. The config holds an id.
//
// Every localStorage path is fail-soft. A corrupt slot, a stale schema version,
// a quota rejection, and a browser that throws on `localStorage` access at all
// (Safari private mode) must each degrade to "no image", never to a thrown
// error inside a render or a sync framework hook.

export const SLOT = 'ablation.image.v1'
const SCHEMA = 1
/** Long edge the stored copy is capped at. The sampler only ever reduces to
 *  cols×rows, which tops out near 250×150 at cellSize 2, so this is generous. */
export const MAX_EDGE = 512

export interface StoredImage {
  id: string
  dataUrl: string
  width: number
  height: number
  /** RGBA, width*height*4 — the shape getImageData().data gives. */
  pixels: Uint8ClampedArray
}

let current: StoredImage | null = null
let rehydrating = false
let version = 1
const listeners = new Set<() => void>()

export function storeVersion(): number {
  return version
}

/** Subscribe to slot changes. Returns an unsubscribe. Exists so a React control
 *  can re-render when a REHYDRATE lands: that decode is async and resolves after
 *  the form has already mounted, so without this the picker renders "none" once
 *  and never learns otherwise. Diversions do not use this — they compare
 *  `storeVersion()` inside their own frame loop instead. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function bump(): void {
  version++
  for (const fn of listeners) fn()
}

export function getImage(id: string | undefined): StoredImage | null {
  if (!id || !current || current.id !== id) return null
  return current
}

/** The one image the store holds, whatever its id — or null if empty.
 *
 *  This exists because an id CANNOT survive a reload: the field carrying it is
 *  `local`, so it never enters the URL, and the URL is the config's only
 *  persistence. After a reload the config has no id while the pixels are right
 *  here. Since there is exactly one slot, the slot is authoritative and the id is
 *  only a within-session change detector — which is all `applyConfig` needs it
 *  for. Callers should prefer `getImage(cfg.id)` and fall back to this. */
export function currentImage(): StoredImage | null {
  return current
}

export function putImage(img: StoredImage): void {
  current = img
  bump()
  try {
    localStorage.setItem(SLOT, JSON.stringify({ v: SCHEMA, id: img.id, dataUrl: img.dataUrl }))
  } catch {
    // Quota, private mode, disabled storage — the in-memory copy still works for
    // this session. Losing it on reload beats losing the upload outright.
  }
}

export function clearImage(): void {
  current = null
  // Reset the one-shot guard too, so the flag means "already attempted for the
  // slot as it currently stands" rather than latching for the page's lifetime.
  rehydrating = false
  bump()
  try {
    localStorage.removeItem(SLOT)
  } catch { /* see putImage */ }
}

/** Decode a data URL to pixels. Browser-only — jsdom has no real image decode,
 *  so unit tests exercise the store through putImage instead.
 *
 *  `keepDataUrl` short-circuits the PNG re-encode. A rehydrate already HAS a
 *  512px data URL in hand — re-encoding it via `toDataURL` only to write the
 *  same-sized payload straight back to localStorage is pure waste on the one path
 *  that runs at app boot. */
export function decodeToPixels(dataUrl: string, keepDataUrl = false): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onerror = () => reject(new Error('decode failed'))
    el.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(el.width, el.height))
      const width = Math.max(1, Math.round(el.width * scale))
      const height = Math.max(1, Math.round(el.height * scale))
      const cv = document.createElement('canvas')
      cv.width = width
      cv.height = height
      const c2d = cv.getContext('2d')
      if (!c2d) return reject(new Error('no 2d context'))
      c2d.drawImage(el, 0, 0, width, height)
      resolve({
        id: `img_${Math.random().toString(36).slice(2, 10)}`,
        dataUrl: keepDataUrl ? dataUrl : cv.toDataURL('image/png'),
        width,
        height,
        pixels: c2d.getImageData(0, 0, width, height).data,
      })
    }
    el.src = dataUrl
  })
}

/** Read the slot back after a reload. Fire-and-forget: the decode is async, so
 *  callers watch `storeVersion()` rather than awaiting this.
 *
 *  Idempotent and self-skipping: it is called from a diversion's `setup`, which
 *  React strict-mode double-invokes, and it must not run at module scope — the
 *  registry glob is `eager`, so every diversion's module is evaluated at app boot
 *  and a module-scope call would make the GALLERY route pay a full image decode
 *  for anyone who has ever uploaded one. */
export function rehydrate(): void {
  if (current || rehydrating) return
  rehydrating = true
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SLOT)
  } catch {
    return // storage unavailable entirely
  }
  if (!raw) return
  let saved: { v?: number; id?: string; dataUrl?: string }
  try {
    saved = JSON.parse(raw)
  } catch {
    return // corrupt — leave the slot alone; the next put overwrites it
  }
  if (saved.v !== SCHEMA || !saved.id || !saved.dataUrl) return
  decodeToPixels(saved.dataUrl, true)
    .then((img) => putImage({ ...img, id: saved.id! }))
    .catch(() => { /* undecodable payload — stay on the procedural picture */ })
}
