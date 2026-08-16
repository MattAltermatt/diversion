// Sourcing pipeline for Ablation's bundled sprite set. NOT imported by the app —
// run by hand when the roster changes; its output (the PNGs, credits.json and the
// PICTURES literal) is what gets committed.
//
// Each entry in SHEETS names a CC0 sprite sheet, its tile size, and the specific
// tiles worth keeping. A sheet is sliced on its tile grid and the chosen tiles are
// written out one PNG per sprite.
//
// No resampling happens here at all — the sprite is committed at its native size
// (16x16 and the like) and Ablation scales it onto the cell grid at runtime. That
// is deliberate: any resize would need nearest-neighbour to avoid manufacturing
// colours the artist never used, and not resizing is strictly safer than resizing
// correctly. It is also why turning `cellSize` down reveals no new detail — there
// is none to reveal.
//
// Requires ImageMagick 7 (`magick`).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'pictures')
const TMP = join(ROOT, 'node_modules', '.cache', 'ablation-sprites')

const magick = (args) => execFileSync('magick', args, { encoding: 'utf8' }).trim()

const SHEETS = [
  {
    id: 'items',
    fileUrl: 'https://opengameart.org/sites/default/files/items.png',
    sourceUrl: 'https://opengameart.org/content/16x16-rpg-items',
    author: 'jetrel',
    license: 'CC0 1.0',
    tile: 16,
    cols: 8,
    // This sheet has NO alpha channel — it sits on an opaque olive-grey. Without
    // keying that out it becomes a real colour band covering most of the frame,
    // and the sprite stops reading as an object in space. Keyed by FLOOD FILL from
    // the border rather than a global colour replace, so grey pixels inside a
    // blade or a helm survive.
    bgKey: 'srgb(111,119,109)',
    // tile index → slug/title. Chosen for a readable silhouette and a handful of
    // distinct colours: those are what make a band clear as one legible event
    // rather than despeckling.
    pick: {
      1:  ['silver-sword', 'Silver Sword'],
      2:  ['golden-sword', 'Golden Sword'],
      3:  ['blue-potion', 'Blue Potion'],
      4:  ['red-flask', 'Red Flask'],
      5:  ['green-potion', 'Green Potion'],
      11: ['jewelled-crown', 'Jewelled Crown'],
      12: ['purple-crown', 'Purple Crown'],
      24: ['crystal-wand', 'Crystal Wand'],
      29: ['scroll', 'Scroll'],
      33: ['wooden-staff', 'Wooden Staff'],
      41: ['scimitar', 'Scimitar'],
      43: ['cauldron', 'Cauldron'],
      48: ['axe', 'Axe'],
      49: ['helm', 'Helm'],
      53: ['treasure-chest', 'Treasure Chest'],
      57: ['red-gem', 'Red Gem'],
      58: ['purple-gem', 'Purple Gem'],
      59: ['green-gem', 'Green Gem'],
    },
  },
  {
    id: 'folk',
    fileUrl: 'https://opengameart.org/sites/default/files/tiny_characters_set.png',
    sourceUrl: 'https://opengameart.org/content/tiny-characters-set',
    author: 'fleurman',
    license: 'CC0 1.0',
    tile: 16,
    cols: 18,
    // Named for what is actually visible — hair plus garment. These are anonymous
    // villager sprites, so an invented role ("Dark Armour") would just be wrong;
    // two near-identical picks were dropped rather than shipped as duplicates in
    // a rotation, where a repeat is noticeable.
    pick: {
      0:   ['red-top', 'Red Top'],
      4:   ['red-tunic', 'Red Tunic'],
      21:  ['orange-dress', 'Orange Dress'],
      54:  ['brown-braid', 'Brown Braid'],
      101: ['olive-coat', 'Olive Coat'],
      130: ['green-top', 'Green Top'],
      163: ['teal-hair', 'Teal Hair'],
      241: ['purple-dress', 'Purple Dress'],
    },
  },
]

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
// Clear the output too, so a renamed or dropped sprite does not linger as an
// orphan PNG that the registry no longer references.
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const kept = []
for (const sheet of SHEETS) {
  const raw = join(TMP, `${sheet.id}.png`)
  const res = await fetch(sheet.fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${sheet.id}: HTTP ${res.status}`)
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()))

  const cellDir = join(TMP, sheet.id)
  mkdirSync(cellDir, { recursive: true })
  magick([raw, '-crop', `${sheet.tile}x${sheet.tile}`, '+repage', '+adjoin',
          join(cellDir, 'c_%04d.png')])

  for (const [indexStr, [slug, title]] of Object.entries(sheet.pick)) {
    const src = join(cellDir, `c_${String(indexStr).padStart(4, '0')}.png`)
    const dest = join(OUT, `${slug}.png`)
    // -trim removes the transparent margin so every sprite fills its own frame
    // consistently; without it a small item sits tiny inside a 16x16 box while a
    // full-height character fills it, and the two would peel at different scales.
    const key = sheet.bgKey
      ? ['-alpha', 'set', '-bordercolor', sheet.bgKey, '-border', '1',
         '-fill', 'none', '-floodfill', '+0+0', sheet.bgKey, '-shave', '1x1']
      : []
    magick([src, ...key, '-trim', '+repage', '-strip', dest])
    const [w, h, k] = magick([dest, '-format', '%w %h %k', 'info:']).split(' ').map(Number)
    if (w < 4 || h < 4) throw new Error(`${slug}: trimmed to ${w}x${h} — wrong tile index?`)
    // Every bundled sprite MUST carry alpha: the transparent surround is what makes
    // the picture read as an object in space rather than a rectangle with a
    // background-coloured band around it. An opaque sheet needs a bgKey.
    if (magick([dest, '-format', '%A', 'info:']) === 'Undefined') {
      throw new Error(`${slug}: no alpha channel — this sheet needs a bgKey`)
    }
    kept.push({ slug, title, author: sheet.author, sourceUrl: sheet.sourceUrl,
                license: sheet.license, w, h, k })
    console.log(`✓ ${slug.padEnd(20)} ${w}x${h}  ${k} colours`)
  }
}

writeFileSync(
  join(OUT, 'credits.json'),
  JSON.stringify(
    kept.map(({ slug, title, author, sourceUrl, license }) =>
      ({ slug, title, author, sourceUrl, license })),
    null, 2,
  ) + '\n',
)

const literal = kept.map((p) =>
  `  { slug: '${p.slug}', title: ${JSON.stringify(p.title)},\n`
  + `    author: ${JSON.stringify(p.author)}, sourceUrl: '${p.sourceUrl}', license: '${p.license}' },`,
).join('\n')
writeFileSync(join(TMP, 'pictures-literal.ts'), `export const PICTURES: Picture[] = [\n${literal}\n]\n`)

console.log(`\nkept ${kept.length} sprites`)
console.log(`literal: ${join(TMP, 'pictures-literal.ts')}`)
