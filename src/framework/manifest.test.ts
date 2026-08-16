import { describe, it, expect } from 'vitest'
// NOT `?raw`: vitest runs with CSS processing off, so `import css from
// './theme.css?raw'` resolves to the EMPTY STRING and the colour assertions below
// would pass vacuously. Same pattern (and the same reason) as responsive.test.ts.
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file.
import { readFileSync } from 'node:fs'

// Contract tests for the web app manifest (#284).
//
// The manifest is a static file in public/ rather than a plugin-generated one, so
// nothing but this file guards it. Three of its properties are load-bearing, and
// all three are the kind a well-meaning future edit "fixes":
//
//   1. NO `id` MEMBER. `id` resolves against start_url's ORIGIN, not against the
//      manifest URL — and mattaltermatt.github.io is a shared origin across every
//      one of this account's GitHub Project Pages. So `"id": "./"` would resolve to
//      `https://mattaltermatt.github.io/` and COLLIDE with any other PWA shipped
//      from a sibling repo. Omitted, `id` defaults to the full start_url
//      (`https://mattaltermatt.github.io/diversion/`), which is unique. Adding an
//      `id` later would also change app identity, orphaning existing installs.
//
//   2. `start_url` / `scope` ARE RELATIVE. Both resolve against the manifest URL,
//      giving `/diversion/` in the Pages build and `/` in dev — matching
//      vite.config.ts's conditional `base` and App.tsx's router basename with no
//      build-time substitution. An absolute `/` would break prod; an absolute
//      `/diversion/` would break dev.
//
//   3. `start_url` POINTS AT THE GALLERY ROOT. Deep links are served by
//      .github/workflows/deploy.yml's 404.html copy, i.e. with an HTTP 404 status.
//      Browsers render the body so sharing still works, but a start_url that 404s
//      BLOCKS install outright.
//
// Deliberately absent: a service worker. iOS Add-to-Home-Screen needs only a
// manifest; only Chrome's install PROMPT wants a SW, and that ships on its own
// branch because an installed SW persists on viewers' machines.

const read = (p: string): string => readFileSync(p, 'utf8')

/**
 * A PNG's real pixel dimensions, straight out of the IHDR chunk (bytes 16..23 of
 * every well-formed PNG). Asserting only that the file is non-empty would let a
 * wrong-size bitmap sit behind a correct `sizes` string forever: Chrome PICKS an
 * icon by the declared `sizes` and then rasterises whatever bytes it finds, so the
 * mismatch degrades the install icon silently rather than failing.
 */
const pngSize = (p: string): string => {
  // `readFileSync` is untyped here (see the @ts-expect-error on its import), so the
  // Buffer methods below need no node types of their own.
  const b = readFileSync(p)
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
}

const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  display: string
  start_url: string
  scope: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}
const html = read('index.html')

// The two origins the app is actually served from. The manifest sits at the root
// of the deploy in both, because Vite copies public/ verbatim under `base`.
const PROD = 'https://mattaltermatt.github.io/diversion/manifest.webmanifest'
const DEV = 'http://localhost:5180/manifest.webmanifest'

describe('web app manifest', () => {
  it('declares standalone display — the only chromeless route on iPhone', () => {
    // Element.requestFullscreen is iPad-only on iOS, so AnimationHost's Fullscreen
    // button is a silent no-op on iPhone. Installing is the whole point.
    expect(manifest.display).toBe('standalone')
  })

  it('omits `id` so it cannot collide with a sibling Project Page', () => {
    expect(manifest).not.toHaveProperty('id')
  })

  it('resolves start_url and scope to the deploy root under both bases', () => {
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    expect(new URL(manifest.start_url, PROD).href).toBe('https://mattaltermatt.github.io/diversion/')
    expect(new URL(manifest.scope, PROD).href).toBe('https://mattaltermatt.github.io/diversion/')
    expect(new URL(manifest.start_url, DEV).href).toBe('http://localhost:5180/')
    expect(new URL(manifest.scope, DEV).href).toBe('http://localhost:5180/')
  })

  it('ships raster icons at both required sizes plus a maskable variant', () => {
    // iOS ignores SVG favicons for home-screen icons, so favicon.svg is not enough.
    const matching = (sizes: string, purpose: string) =>
      manifest.icons.filter((i) => i.sizes === sizes && i.purpose === purpose)
    expect(matching('192x192', 'any')).toHaveLength(1)
    expect(matching('512x512', 'any')).toHaveLength(1)
    expect(matching('512x512', 'maskable')).toHaveLength(1)
    // Pinned absolute URLs, not a formula derived from `icon.src` — deriving both
    // sides of the comparison from the same value asserts nothing.
    expect(manifest.icons.map((i) => new URL(i.src, PROD).href)).toEqual([
      'https://mattaltermatt.github.io/diversion/icon-192.png',
      'https://mattaltermatt.github.io/diversion/icon-512.png',
      'https://mattaltermatt.github.io/diversion/icon-maskable-512.png',
    ])
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      // Relative, for the same reason start_url is.
      expect(icon.src.startsWith('./')).toBe(true)
      // The file is actually there — a manifest icon 404 fails install silently —
      // AND its real pixel size matches what the manifest claims.
      expect(pngSize(`public/${icon.src.slice(2)}`)).toBe(icon.sizes)
    }
  })

  it('agrees with --bg and the theme-color meta on the ground colour', () => {
    // Three copies of one value: the CSS ground, the standalone status-bar colour,
    // and the splash background. Drift between them is invisible until it is on a
    // phone. The literal below is the guard that the bytes actually arrived — an
    // empty read would make every comparison below it vacuous.
    const bg = /--bg:\s*(#[0-9a-f]{3,8})/i.exec(read('src/framework/theme.css'))?.[1]
    const meta = /<meta name="theme-color" content="(#[0-9a-f]{3,8})"/i.exec(html)?.[1]
    expect(bg).toBe('#08080a')
    expect(meta).toBe(bg)
    expect(manifest.theme_color).toBe(bg)
    expect(manifest.background_color).toBe(bg)
  })

  it('is linked from index.html, along with an apple-touch-icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    // 180x180 is what current iOS asks for, and it is not in the manifest, so
    // nothing else pins it.
    expect(pngSize('public/apple-touch-icon.png')).toBe('180x180')
  })
})
