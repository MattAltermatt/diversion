/** The small, entry-chunk half of "keep the whole gallery offline" (#293).
 *
 *  It is split from `offlineWarm.ts` for one mechanical reason: `OfflineToggle` needs
 *  these three things at MOUNT (what was warmed, and whether it is still current),
 *  while the warming engine is only needed on a press. A single module meant one
 *  static import, and a static import defeats the dynamic one entirely — Rollup says
 *  so out loud:
 *
 *    [INEFFECTIVE_DYNAMIC_IMPORT] offlineWarm.ts is dynamically imported by
 *    OfflineToggle.tsx but also statically imported by OfflineToggle.tsx
 *
 *  which put `collectTargets`, the sprite-manifest fetch and all of it into the entry
 *  chunk that #288 spent a cycle shrinking, while four comments claimed the opposite.
 *  Guarded by `check-bundle-size.mjs`, because `npm run size` alone would not notice
 *  a few kB and the warning scrolls past in a green build.
 *
 *  Everything here is pure or fail-soft; nothing here fetches. */

/** The build-time asset map, republished on `window` by the #291 preload script — the
 *  only place in the app that knows every emitted, content-hashed filename. */
export interface PublishedAssets {
  0: string[] // shared dep chunk filenames (precached already — never warmed)
  1: Record<string, (string | number)[]> // slug -> [own chunk, ...dep indices]
  2: string[] // runtime-cached extras (neural-ca's weights)
}

declare global {
  interface Window {
    __diversionAssets?: PublishedAssets
  }
}

export function publishedAssets(): PublishedAssets | undefined {
  return typeof window === 'undefined' ? undefined : window.__diversionAssets
}

/** Order-independent, cheap, and changes whenever any content hash does — which is
 *  what makes a stored copy detectably stale after a deploy. */
export function fingerprintOf(chunks: string[], extras: string[]): string {
  const all = [...chunks, ...extras].sort().join('\n')
  let h = 2166136261
  for (let i = 0; i < all.length; i++) {
    h ^= all.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${(h >>> 0).toString(36)}:${chunks.length + extras.length}`
}

/** This build's fingerprint, or null if the asset map was never published (an old
 *  cached index.html, or a harness). Pure — no network, safe in a mount effect. */
export function currentFingerprint(): string | null {
  const published = publishedAssets()
  if (!published) return null
  const chunks = Object.values(published[1]).map((entry) => String(entry[0]))
  return fingerprintOf(chunks, published[2] ?? [])
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
