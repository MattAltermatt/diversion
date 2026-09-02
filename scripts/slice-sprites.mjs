// Sourcing pipeline for the bundled sprite set shared by Ablation and Salvage. NOT
// imported by the app — run by hand when the roster changes; its output (the PNGs,
// credits.json and the PICTURES literal) is what gets committed.
//
// Each entry in SHEETS names a CC0 sprite sheet and the specific sprites worth
// keeping, in one of two shapes:
//   pick:  { tileIndex: [slug, title] }      — a sheet laid out on a regular grid
//                                              (`tile` px square, `cols` across)
//   rects: { 'WxH+X+Y': [slug, title] }      — an irregular sheet, cropped by pixel
//                                              rectangle (ImageMagick geometry)
//   files: { 'name.png': [slug, title] }      — a zip of one-sprite-per-file PNGs
// A sheet published as an exact integer upscale of its art declares `scale: N`; the
// cell is point-sampled back down and the round trip is asserted pixel-identical.
// Get rects from connected components on the alpha channel:
//   magick sheet.png -alpha extract -threshold 0 \
//     -define connected-components:verbose=true -connected-components 8 null:
//
// No resampling happens here at all — the sprite is committed at its native size
// (16x16 and the like) and both consumers scale it onto their cell grid at runtime.
// That is deliberate: any resize would need nearest-neighbour to avoid manufacturing
// colours the artist never used, and not resizing is strictly safer than resizing
// correctly. It is also why turning `cellSize` down reveals no new detail — there
// is none to reveal.
//
// Requires ImageMagick 7 (`magick`) and `unzip`.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'pictures')
const TMP = join(ROOT, 'node_modules', '.cache', 'ablation-sprites')

const magick = (args) => execFileSync('magick', args, { encoding: 'utf8' }).trim()

const OGA = 'https://opengameart.org/sites/default/files'

const SHEETS = [
  {
    id: 'items',
    fileUrl: `${OGA}/items.png`,
    sourceUrl: 'https://opengameart.org/content/16x16-rpg-items',
    author: 'Jetrel',
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
    fileUrl: `${OGA}/tiny_characters_set.png`,
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
  {
    // 180 sixteen-pixel animals and monsters in a flat Kenney-style palette, five
    // to nine colours each — the best fit for the mechanic in the whole sweep. The
    // page's own attribution notice reads "Tiny Creatures by Clint Bellanger".
    id: 'tiny',
    fileUrl: `${OGA}/tiny-creatures.zip`,
    zipEntry: 'tiny-creatures/Tilemap/tilemap_packed.png',
    sourceUrl: 'https://opengameart.org/content/tiny-creatures',
    author: 'Clint Bellanger',
    license: 'CC0 1.0',
    tile: 16,
    cols: 10,
    pick: {
      13:  ['toadstool', 'Toadstool'],
      31:  ['blue-dragon', 'Blue Dragon'],
      33:  ['red-dragon', 'Red Dragon'],
      45:  ['flame', 'Flame'],
      66:  ['purple-wizard', 'Purple Wizard'],
      117: ['owl', 'Owl'],
      155: ['zebra', 'Zebra'],
      156: ['lion', 'Lion'],
      157: ['tiger', 'Tiger'],
      158: ['elephant', 'Elephant'],
      159: ['giraffe', 'Giraffe'],
      169: ['fox', 'Fox'],
    },
  },
  {
    // The page is titled "32x32 creatures" and its PNG is an exact 2x export (every
    // 2x2 block uniform — asserted below), so `scale: 2` takes each cell back to the
    // 32px art with point sampling. Shipping the 64px export would have put these
    // ten on Salvage's box-averaging downsample in any arena under ~1500 CSS px,
    // manufacturing colours the artist never used. Kept because nothing else in the
    // sweep has monsters this bold: big flat areas, silhouettes that read across a room.
    id: 'monsters',
    fileUrl: `${OGA}/creatures_3-export_1.png`,
    sourceUrl: 'https://opengameart.org/content/assorted-32x32-creatures',
    author: 'AndHeGames',
    license: 'CC0 1.0',
    tile: 64,
    cols: 9,
    scale: 2,
    pick: {
      0:  ['red-mushroom', 'Red Mushroom'],
      7:  ['purple-blob', 'Purple Blob'],
      9:  ['orb-walker', 'Orb Walker'],
      18: ['green-frog', 'Green Frog'],
      21: ['blue-beetle', 'Blue Beetle'],
      33: ['green-cube', 'Green Cube'],
      36: ['red-imp', 'Red Imp'],
      37: ['blue-ghost', 'Blue Ghost'],
      49: ['pink-squid', 'Pink Squid'],
      67: ['blue-slime', 'Blue Slime'],
    },
  },
  {
    // Animation strips on an opaque backdrop that alternates between two greys,
    // one per 32px cell — so the key is read from each CELL's corner rather than
    // declared once for the sheet. One frame per creature.
    id: 'critters',
    fileUrl: `${OGA}/TL_Creatures.png`,
    sourceUrl: 'https://opengameart.org/content/various-creatures',
    author: 'GrafxKid',
    license: 'CC0 1.0',
    tile: 32,
    cols: 8,
    bgKey: 'corner',
    pick: {
      10: ['pink-blob', 'Pink Blob'],
      18: ['orange-snail', 'Orange Snail'],
      26: ['balloon', 'Balloon'],
      34: ['green-robot', 'Green Robot'],
      42: ['blue-drop', 'Blue Drop'],
      51: ['pink-cat', 'Pink Cat'],
      58: ['ladybird', 'Ladybird'],
      66: ['tv-robot', 'TV Robot'],
      74: ['ghost', 'Ghost'],
    },
  },
  {
    // Shaded rather than flat (~970 colours across 64 sprites), which the OKLab
    // quantizer bands down at load. Chosen for silhouettes that survive that.
    id: 'food',
    fileUrl: `${OGA}/Food.png`,
    sourceUrl: 'https://opengameart.org/content/64-16x16-food-sprites',
    author: 'Sanglorian',
    license: 'CC0 1.0',
    tile: 16,
    cols: 8,
    pick: {
      12: ['red-apple', 'Red Apple'],
      18: ['pineapple', 'Pineapple'],
      20: ['beer-mug', 'Beer Mug'],
      27: ['aubergine', 'Aubergine'],
      33: ['strawberry', 'Strawberry'],
      40: ['pretzel', 'Pretzel'],
      48: ['watermelon', 'Watermelon'],
      50: ['drumstick', 'Drumstick'],
      63: ['shrimp', 'Shrimp'],
    },
  },
  {
    // The page's preview sheet is a 4x upscale on opaque cyan; the zip carries the
    // native 16x16 PNGs, one per food, already with alpha — so this entry names
    // FILES inside the archive rather than cells of a sheet.
    id: 'foodies',
    fileUrl: `${OGA}/Foodies_0.zip`,
    sourceUrl: 'https://opengameart.org/content/16x16px-food-items',
    author: 'maruki',
    license: 'CC0 1.0',
    files: {
      'lamen.png':    ['ramen-bowl', 'Ramen Bowl'],
      'egg.png':      ['fried-egg', 'Fried Egg'],
      'pizza.png':    ['pizza-slice', 'Pizza Slice'],
      'sushi.png':    ['maki-roll', 'Maki Roll'],
      'onirigi.png':  ['onigiri', 'Onigiri'],
      'donut.png':    ['donut', 'Donut'],
      'popsicle.png': ['popsicle', 'Popsicle'],
      'hotdog.png':   ['hot-dog', 'Hot Dog'],
      'burger.png':   ['burger', 'Burger'],
    },
  },
  {
    // Irregular layout — objects of every size packed by hand — so these are pixel
    // rectangles, not tile indices.
    id: 'props',
    fileUrl: `${OGA}/props_0.png`,
    sourceUrl: 'https://opengameart.org/content/rpg-item-set',
    author: 'Jetrel',
    license: 'CC0 1.0',
    rects: {
      '24x38+109+68':  ['clay-vase', 'Clay Vase'],
      '25x47+79+32':   ['candelabra', 'Candelabra'],
      '20x28+4+138':   ['kite-shield', 'Kite Shield'],
      '25x17+4+36':    ['open-book', 'Open Book'],
      '19x27+73+156':  ['flowering-plant', 'Flowering Plant'],
      '22x20+161+36':  ['bread-loaf', 'Bread Loaf'],
      '40x21+128+189': ['mace', 'Mace'],
      '17x17+87+108':  ['cabbage', 'Cabbage'],
      '22x14+123+47':  ['salami', 'Salami'],
      '16x19+129+106': ['cucumber', 'Cucumber'],
    },
  },
  {
    id: 'haunted',
    fileUrl: `${OGA}/hauntedall.png`,
    sourceUrl: 'https://opengameart.org/content/misc-household-items-and-more',
    author: 'NaRNeRZz',
    license: 'CC0 1.0',
    rects: {
      '42x48+67+80':   ['red-armchair', 'Red Armchair'],
      '32x26+112+131': ['mantel-clock', 'Mantel Clock'],
      '15x32+113+96':  ['tulip-vase', 'Tulip Vase'],
    },
  },
  {
    // A 64px grid of furniture, but the beds sit two to a cell — so rects.
    id: 'house',
    fileUrl: `${OGA}/House%20Objects%201%20Revised_2.png`,
    sourceUrl: 'https://opengameart.org/content/home-objects',
    author: 'Jannax',
    license: 'CC0 1.0',
    rects: {
      '32x64+128+128': ['white-bed', 'White Bed'],
      '32x64+160+128': ['blue-bed', 'Blue Bed'],
    },
  },
  {
    id: 'lamps',
    fileUrl: `${OGA}/lamps_all.png`,
    sourceUrl: 'https://opengameart.org/content/lamps-lights-n-torches',
    author: 'Reactorcore',
    license: 'CC0 1.0',
    rects: {
      '20x26+75+3': ['table-lamp', 'Table Lamp'],
      '12x14+5+93': ['oil-lamp', 'Oil Lamp'],
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
  const body = Buffer.from(await res.arrayBuffer())
  const zip = join(TMP, `${sheet.id}.zip`)
  const unzip = (entry) => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 64 << 20 })
  if (sheet.zipEntry || sheet.files) writeFileSync(zip, body)
  if (sheet.zipEntry) writeFileSync(raw, unzip(sheet.zipEntry))
  else if (!sheet.files) writeFileSync(raw, body)

  // Every pick becomes a crop geometry; the two declaration shapes differ only in
  // how that geometry is spelled.
  const crops = []
  if (sheet.pick) {
    const sheetW = Number(magick([raw, '-format', '%w', 'info:']))
    if (Math.floor(sheetW / sheet.tile) !== sheet.cols) {
      throw new Error(`${sheet.id}: width ${sheetW} / tile ${sheet.tile} is not ${sheet.cols} columns`)
    }
    for (const [indexStr, [slug, title]] of Object.entries(sheet.pick)) {
      const i = Number(indexStr)
      const col = i % sheet.cols, row = Math.floor(i / sheet.cols)
      crops.push({ geometry: `${sheet.tile}x${sheet.tile}+${col * sheet.tile}+${row * sheet.tile}`, slug, title })
    }
  }
  for (const [geometry, [slug, title]] of Object.entries(sheet.rects ?? {})) crops.push({ geometry, slug, title })
  for (const [entry, [slug, title]] of Object.entries(sheet.files ?? {})) crops.push({ entry, slug, title })

  for (const { geometry, entry, slug, title } of crops) {
    const cell = join(TMP, `${sheet.id}-${slug}.png`)
    if (entry) writeFileSync(cell, unzip(entry))
    else magick([raw, '-crop', geometry, '+repage', cell])
    if (sheet.scale) {
      // Down BEFORE trim: the crop offsets are multiples of the cell, so the upscale
      // grid is aligned here; a trim first could shift it by an odd offset.
      const pct = `${100 / sheet.scale}%`
      const back = execFileSync('magick', [cell, '-sample', pct, '-sample', `${sheet.scale * 100}%`, 'miff:-'])
      const diff = execFileSync('magick', ['compare', '-metric', 'AE', cell, 'miff:-', 'null:'], { input: back, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
      if (Number(diff) !== 0) throw new Error(`${slug}: not an exact ${sheet.scale}x upscale (${diff} pixels differ) — drop 'scale'`)
      magick([cell, '-sample', pct, cell])
    }
    const dest = join(OUT, `${slug}.png`)
    // 'corner' reads the key off this cell's own top-left pixel — for a sheet whose
    // opaque backdrop changes colour from cell to cell.
    const bgKey = sheet.bgKey === 'corner' ? magick([cell, '-format', '%[pixel:p{0,0}]', 'info:']) : sheet.bgKey
    // -trim removes the transparent margin so every sprite fills its own frame
    // consistently; without it a small item sits tiny inside a 16x16 box while a
    // full-height character fills it, and the two would peel at different scales.
    const key = bgKey
      ? ['-alpha', 'set', '-bordercolor', bgKey, '-border', '1',
         '-fill', 'none', '-floodfill', '+0+0', bgKey, '-shave', '1x1']
      : []
    magick([cell, ...key, '-trim', '+repage', '-strip', dest])
    const [w, h, k] = magick([dest, '-format', '%w %h %k', 'info:']).split(' ').map(Number)
    if (w < 4 || h < 4) throw new Error(`${slug}: trimmed to ${w}x${h} — wrong tile index?`)
    // Every bundled sprite MUST carry alpha: the transparent surround is what makes
    // the picture read as an object in space rather than a rectangle with a
    // background-coloured band around it. An opaque sheet needs a bgKey.
    if (magick([dest, '-format', '%A', 'info:']) === 'Undefined') {
      throw new Error(`${slug}: no alpha channel — this sheet needs a bgKey`)
    }
    // ...and the alpha must actually be USED: an opaque cell that happened to carry
    // an alpha channel would pass the check above and still ship as a slab.
    if (Number(magick([dest, '-alpha', 'extract', '-format', '%[fx:minima]', 'info:'])) > 0) {
      throw new Error(`${slug}: no transparent pixel survives the trim — key not applied, the crop is not one object, or the sprite is a solid rectangle`)
    }
    // 'corner' has a silent bad mode: a sprite touching its cell's top-left pixel
    // hands us a SPRITE colour as the key, the real backdrop stays opaque, and the
    // check above still passes on the nibbled edge. All four corners must be clear.
    if (sheet.bgKey === 'corner') {
      const corners = magick([dest, '-format', '%[pixel:p{0,0}] %[pixel:p{-1,0}] %[pixel:p{0,-1}] %[pixel:p{-1,-1}]', 'info:'])
      if (corners.split(' ').some((c) => !/,0\)$/.test(c))) {
        throw new Error(`${slug}: an opaque corner survives — the corner key sampled a sprite pixel (${corners})`)
      }
    }
    kept.push({ slug, title, author: sheet.author, sourceUrl: sheet.sourceUrl,
                license: sheet.license, w, h, k })
    console.log(`✓ ${slug.padEnd(20)} ${String(w).padStart(2)}x${String(h).padEnd(3)} ${k} colours`)
  }
}

const slugs = kept.map((p) => p.slug)
const dup = slugs.find((s, i) => slugs.indexOf(s) !== i)
if (dup) throw new Error(`duplicate slug across sheets: ${dup}`)

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
