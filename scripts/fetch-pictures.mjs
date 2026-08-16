// Sourcing pipeline for Ablation's bundled picture set. NOT imported by the app —
// this runs by hand when the set changes, and its output (the PNGs, credits.json
// and the PICTURES literal) is what gets committed.
//
// Reads scripts/pictures-manifest.json, an array of:
//   { slug, genre, title, author, sourceUrl, fileUrl, license }
// `sourceUrl` is the human page whose licence statement was READ; `fileUrl` is the
// direct download. Both are recorded so provenance stays auditable.
//
// Requires ImageMagick 7 (`magick`).
//
// ── Why nearest-neighbour, and why an integer divisor ────────────────────────
// Ablation quantizes a picture to a handful of flat bands, and pixel art is
// already quantized — that is the whole reason this material was chosen. A SMOOTH
// resample averages across every hard pixel-art edge and across dithering,
// manufacturing intermediate tones the artist never used. Measured on ansimuz's
// forest-background (544×320, 9 colours):
//
//     -filter point -resize 25%  →  136×80,    9 colours   palette intact
//                   -resize 25%  →  136×80, 2494 colours   destroyed
//
// An integer divisor matters too: a fractional ratio drops source pixels unevenly,
// which reads as lumpy across flat regions.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'pictures')
const TMP = join(ROOT, 'node_modules', '.cache', 'ablation-pictures')

/** Long edge the bundled copy must not exceed. Sized so the DEFAULT cell grid
 *  (~140×85 at cellSize 10 on a 1500×900 canvas) is an upsample, which is what
 *  makes Ablation's box-average sampler reproduce the palette exactly. */
const MAX_EDGE = 160

const magick = (args) => execFileSync('magick', args, { encoding: 'utf8' }).trim()
const dims = (f) => magick([f, '-format', '%w %h', 'info:']).split(' ').map(Number)
const colors = (f) => Number(magick([f, '-format', '%k', 'info:']))

/** Smallest integer divisor bringing the long edge to <= MAX_EDGE. */
function divisorFor(w, h) {
  const long = Math.max(w, h)
  let d = 1
  while (long / d > MAX_EDGE) d++
  return d
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts', 'pictures-manifest.json'), 'utf8'))
mkdirSync(TMP, { recursive: true })

const kept = []
const rejected = []

for (const entry of manifest) {
  const { slug, genre, title, author, sourceUrl, fileUrl, license } = entry
  for (const [k, v] of Object.entries({ slug, genre, title, author, sourceUrl, fileUrl, license })) {
    if (!v) throw new Error(`${slug || '(no slug)'}: manifest entry is missing "${k}"`)
  }
  if (!/^CC0/i.test(license)) throw new Error(`${slug}: licence "${license}" is not CC0`)

  const raw = join(TMP, `${slug}.src`)
  if (!existsSync(raw)) {
    const res = await fetch(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) { rejected.push([slug, `HTTP ${res.status}`]); continue }
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()))
  }

  let w, h
  try { [w, h] = dims(raw) } catch { rejected.push([slug, 'undecodable']); continue }

  // A portrait sheet stretches badly into a landscape grid. Reject rather than
  // silently ship something distorted.
  if (h > w) { rejected.push([slug, `portrait ${w}x${h}`]); continue }

  const d = divisorFor(w, h)
  const genreDir = join(OUT_DIR, genre)
  mkdirSync(genreDir, { recursive: true })
  const dest = join(genreDir, `${slug}.png`)

  const before = colors(raw)
  if (d === 1) {
    magick([raw, '-strip', dest])
  } else {
    magick([raw, '-filter', 'point', '-resize', `${(100 / d).toFixed(6)}%`, '-strip', dest])
  }
  const after = colors(dest)
  const [ow, oh] = dims(dest)

  // The guard that catches a wrong filter. Nearest-neighbour can only ever DROP
  // colours; a rise means smoothing crept in and the palette is already ruined.
  if (after > before) {
    rejected.push([slug, `colour count rose ${before}→${after} — filter did not take`])
    continue
  }

  kept.push({ ...entry, width: ow, height: oh, divisor: d, colors: after })
  console.log(`✓ ${genre}/${slug}  ${w}x${h} ÷${d} → ${ow}x${oh}  ${before}→${after} colours`)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  join(OUT_DIR, 'credits.json'),
  JSON.stringify(
    kept.map(({ slug, genre, title, author, sourceUrl, license }) =>
      ({ slug, genre, title, author, sourceUrl, license })),
    null, 2,
  ) + '\n',
)

// The PICTURES literal, pasted into src/diversions/ablation/pictures.ts.
const literal = kept.map((p) =>
  `  { slug: '${p.slug}', genre: '${p.genre}', title: ${JSON.stringify(p.title)},\n`
  + `    author: ${JSON.stringify(p.author)}, sourceUrl: '${p.sourceUrl}', license: '${p.license}' },`,
).join('\n')
writeFileSync(join(TMP, 'pictures-literal.ts'), `export const PICTURES: Picture[] = [\n${literal}\n]\n`)

console.log(`\nkept ${kept.length}, rejected ${rejected.length}`)
for (const [slug, why] of rejected) console.log(`  ✗ ${slug}: ${why}`)
const byGenre = {}
for (const p of kept) byGenre[p.genre] = (byGenre[p.genre] ?? 0) + 1
console.log('\nper genre:', byGenre)
console.log(`\nliteral written to ${join(TMP, 'pictures-literal.ts')}`)
