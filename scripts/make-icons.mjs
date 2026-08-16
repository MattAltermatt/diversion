// Generates the PWA / home-screen icon PNGs from public/favicon.svg. NOT imported
// by the app — run by hand when the mark changes; its output (the PNGs in public/)
// is what gets committed.
//
//   node scripts/make-icons.mjs
//
// Why PNGs at all when a crisp SVG favicon already exists: iOS ignores SVG
// favicons for home-screen icons, and the web app manifest's `icons` member has no
// SVG fallback path on that platform. So the mark is rasterised once, here.
//
// Three shapes come out of it:
//   icon-192 / icon-512      purpose "any"      — modest 14% inset, opaque ground
//   icon-maskable-512        purpose "maskable" — mark inscribed in the 80% safe
//                                                 circle, so Android's adaptive
//                                                 mask can crop to any silhouette
//                                                 without clipping the glyph
//   apple-touch-icon (180)   <link rel>         — iOS composites a transparent PNG
//                                                 onto black and rounds the corners
//                                                 itself, so this one must be opaque
//
// The ground is #08080a — the same value as `--bg` in src/framework/theme.css, the
// `theme-color` meta in index.html, and `theme_color`/`background_color` in
// public/manifest.webmanifest. All four must agree; manifest.test.ts guards the
// last three.
//
// Requires librsvg (`rsvg-convert`) for the render — the mark leans on SVG filters
// and a mask, which ImageMagick's built-in MSVG renderer does not honour — and
// ImageMagick 7 (`magick`) for the composition.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'public', 'favicon.svg')
const OUT = join(ROOT, 'public')
const TMP = join(ROOT, 'node_modules', '.cache', 'diversion-icons')

const GROUND = '#08080a'

// Android's maskable safe zone is the centred circle of diameter 0.8 * edge —
// anything outside it MAY be cropped by the launcher's mask. The fit below
// inscribes the INK's bounding box in that circle, which is the worst case: it
// holds for any mark, including one whose box corners are actually inked.
const SAFE = 0.8

// size: output square edge. inset: fraction of the edge left clear on each side.
// circle: inscribe the mark in the maskable safe circle instead of a box.
const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0.14 },
  { file: 'icon-512.png', size: 512, inset: 0.14 },
  { file: 'icon-maskable-512.png', size: 512, circle: true },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.14 },
]

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const render = (width, out) => execFileSync('rsvg-convert', ['-w', String(width), '-o', out, SRC])
/** Bounding box of the non-transparent pixels, as [w, h]. */
const inkBox = (png) => {
  const out = execFileSync('magick', [png, '-format', '%@', 'info:'], { encoding: 'utf8' })
  const m = /^(\d+)x(\d+)/.exec(out.trim())
  if (!m) throw new Error(`could not measure ink in ${png}: ${out}`)
  return [Number(m[1]), Number(m[2])]
}

// Everything below is fitted against the MARK'S INK, measured from a probe render —
// never against the SVG's viewBox. The two are not the same thing and the difference
// is not cosmetic: favicon.svg's path does not fill its viewBox symmetrically, so
// centring the rendered raster leaves the ink ~3px off centre, which is enough to
// push a "provably inside the safe circle" maskable fit back outside it. Measure,
// then `-trim +repage` so the thing being centred is the ink itself.
const PROBE = 1024
const probe = join(TMP, 'probe.png')
render(PROBE, probe)
const [probeW, probeH] = inkBox(probe)

for (const { file, size, inset, circle } of TARGETS) {
  // Target extent of the ink: its diagonal for the maskable circle, its larger side
  // for the inset box. FLOOR, so rounding can only ever shrink the mark — rounding
  // up puts the maskable corner a fraction of a pixel outside the safe radius, the
  // kind of miss that survives review because nothing visibly clips.
  const target = circle ? SAFE * size : size * (1 - 2 * inset)
  const measured = circle ? Math.hypot(probeW, probeH) : Math.max(probeW, probeH)
  const w = Math.floor((PROBE * target) / measured)

  const glyph = join(TMP, `glyph-${file}`)
  render(w, glyph)
  execFileSync('magick', [
    glyph,
    '-trim', '+repage',
    '-background', GROUND,
    '-gravity', 'center',
    '-extent', `${size}x${size}`,
    // Every pixel is opaque once the mark is composited onto the ground, so the
    // alpha channel is pure overhead (~9% of the file). Dropping it also means iOS
    // never gets a chance to composite the icon onto its own black.
    '-alpha', 'off',
    '-strip',
    join(OUT, file),
  ])
  const [inkW, inkH] = inkBox(glyph)
  const fit = circle
    ? `ink diag ${Math.hypot(inkW, inkH).toFixed(1)} / safe ${(SAFE * size).toFixed(1)}`
    : `ink ${inkW}x${inkH}`
  console.log(`${file}  ${size}x${size}  ${fit}`)
}

rmSync(TMP, { recursive: true, force: true })
