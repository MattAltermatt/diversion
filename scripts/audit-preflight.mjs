#!/usr/bin/env node
// The mechanical half of a gallery audit (#314). Prints one brief per diversion:
// everything a human reviewer would otherwise have to dig out of git, the schema
// and the source before they can start judging.
//
// Usage:  node scripts/audit-preflight.mjs <slug>
//         node scripts/audit-preflight.mjs --next        # first unticked in #314
//         node scripts/audit-preflight.mjs --unaudited   # list what is left
//
// It loads the REAL modules through vite (`ssrLoadModule`), not a regex over the
// source, because half of what matters — defaults, `.meta()` bounds, which optional
// Diversion hooks exist — only exists once zod has run. An earlier draft parsed
// meta.ts with a regex and silently truncated every description written as
// concatenated string literals; about a third of the gallery writes them that way.
//
// Nothing here renders a pixel, so every visual judgement is left to the reviewer.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIVERSIONS = path.join(ROOT, 'src/diversions')
const LIVE = 'https://mattaltermatt.github.io/diversion'
const DEV = 'http://localhost:5180'
const LEDGER_ISSUE = '314'

// WCAG 2.x contrast the darkest palette stop must clear against the ground. This
// mirrors `MIN_CONTRAST` in src/diversions/ablation/quantize.ts, which is module-
// private — if that constant moves, move this one. The formula itself is the W3C
// spec, not repo logic, so implementing it here is not a re-derivation.
const MIN_CONTRAST = 1.88

// A commit touching more than this many diversion folders was a repo-wide sweep, not
// attention paid to this piece. Naive `git log -1` reports 2026-08-16 for 127 of the
// 137 and tells you nothing, which is why the split exists at all.
//
// Calibrated against the real ones — #288's meta.ts split touched 137 folders and
// #256's UX canon pass touched 110 — NOT against "more than a couple". At a threshold
// of 3 the targeted multi-piece fixes were swept up with them (#268's reseed guards
// hit 5 folders because 5 pieces had the bug, #273's per-frame costs hit 11), and 94
// of 137 pieces then claimed nobody had touched them since birth. At least 33 of
// those had in fact had a bug fixed. The subjects are printed either way, so a
// borderline commit is the reader's call rather than the constant's.
const SWEEP_THRESHOLD = 25

// A person's name in an ATTRIBUTIONAL position — possessive, or after by/from/after,
// or an EN-DASH pair. Three details are load-bearing, each learned by getting it wrong:
//
//   - A bare capitalised pair is not enough. Two thirds of the gallery opens its
//     header comment with its own title ("Ant Colony Optimization", "Aurora
//     Curtains"), which flagged 86 of 137 pieces as possible uncredited ports.
//   - The dash WIDTH matters. This codebase writes real name pairs with an en dash
//     (Drossel-Schwabl, Mirollo-Strogatz, Allen-Cahn, all with \u2013) and ordinary
//     compound adjectives with a hyphen (Diffusion-Limited); matching both flagged 70.
//   - A name token may carry an INTERNAL capital. `[A-Z][a-z]{2,}` cannot match
//     "McCabe", so the card "Jonathan McCabe's multi-scale Turing patterns" read as
//     an uncredited original — on a piece whose entire identity is that attribution.
const PERSON_NAME =
  /\b(?:by|from|after|due to)\s+[A-Z][A-Za-z]{2,}\s+[A-Z][A-Za-z]{2,}|\b[A-Z][A-Za-z]{2,}\s+[A-Z][A-Za-z]{2,}(?:'s|\u2019s)|\b[A-Z][A-Za-z]{2,}\u2013[A-Z][A-Za-z]{2,}\b/

const CREDIT_MARKERS =
  /\b(clean-room|port of|ported from|remake of|homage|inspired by|based on|xscreensaver|©|\(c\)\s*\d{4})/i

// "after Jamie Zawinski" must stay CASE-SENSITIVE, so it cannot live in the list
// above: under `/i` the `[A-Z]` matches any letter, turning the proper-noun test into
// "the word after, followed by a letter". That put 15 pieces — ablation among them,
// on the evidence "after a reload" — in the tier whose text tells you to go and
// attribute the piece to someone.
const CREDIT_AFTER = /\bafter [A-Z]/

// Rough family buckets for the "worth keeping in a gallery of 137" call — you cannot
// judge that without knowing a piece's neighbours. Keyword matching over title +
// description, so it is a prompt for comparison, never a verdict.
const FAMILIES = {
  'cellular automata': /\bcellular automat|\bCA\b|life-like|rule ?\d|lattice|grid of cells|neighbou?r count/i,
  'agents & flocking': /\bflock|\bboid|swarm|agent|steer|herd|predator|forag|ant\b|termite/i,
  'reaction-diffusion': /reaction.?diffusion|gray-?scott|turing pattern|morphogen|chemical/i,
  'attractors & maps': /attractor|\bmap\b.*iterat|hopalong|lorenz|clifford|orbit trap|strange/i,
  'tiling & tessellation': /tessellat|tiling|penrose|truchet|mosaic|voronoi|delaunay|quilt|kaleidoscop/i,
  'fluid & waves': /fluid|wave|ripple|interferen|advect|vortic|plasma|smoke/i,
  'growth & aggregation': /\bgrowth|aggregat|\bDLA\b|dendrit|crystal|coral|branch|tree|root|vein|slime|physarum/i,
  'particles & fields': /particle|flow field|trail|emitter|firework|dust|snow|rain/i,
  'fractals': /fractal|self-similar|mandelbrot|julia|sierpinski|apollonian|recursi/i,
  'physics & bodies': /physics|gravity|collision|spring|pendulum|rigid|bounce|orbit/i,
  'evolution & search': /evolv|genetic|generation by generation|fitness|mutat|hill-climb|natural selection/i,
  'geometry & curves': /lissajous|spiral|rosette|epicycl|curve|polyhedr|hypercube|projection|geometry/i,
  'light & optics': /aurora|nebula|glow|caustic|refract|prism|lens|bloom|starfield/i,
  'text & glyphs': /glyph|typograph|letter|digit|character|matrix rain/i,
}

// ---------------------------------------------------------------- small helpers

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
const slugsOnDisk = () =>
  fs
    .readdirSync(DIVERSIONS)
    .filter((s) => fs.existsSync(path.join(DIVERSIONS, s, 'meta.ts')))
    .sort()

/** Every non-test source file belonging to one diversion, as [relPath, text]. */
function sources(slug) {
  const dir = path.join(DIVERSIONS, slug)
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => [`src/diversions/${slug}/${f}`, fs.readFileSync(path.join(dir, f), 'utf8')])
}

const wrap = (text, indent, width = 92) => {
  const out = []
  // Paragraph breaks the caller authored are kept; only over-long lines are folded.
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const word of para.trim().split(/\s+/)) {
      if (line && line.length + word.length + 1 > width) {
        out.push(line)
        line = ''
      }
      line += (line ? ' ' : '') + word
    }
    out.push(line)
  }
  return out.join('\n' + ' '.repeat(indent))
}

// Emoji occupy two terminal columns while `padEnd` counts them as one code unit, so
// the icon gets a fixed two-column slot measured by display width rather than length.
const displayWidth = (s) => [...s].reduce((n, c) => n + (c.codePointAt(0) > 0x2100 ? 2 : 1), 0)
const row = (icon, label, body) => {
  const slot = icon + ' '.repeat(Math.max(0, 2 - displayWidth(icon)))
  return `${slot} ${label.padEnd(11)} ${wrap(body, 15)}`
}

// ------------------------------------------------------------------- git history

/** Commits touching this diversion, split into substantive vs repo-wide sweeps. */
function history(slug) {
  const rel = `src/diversions/${slug}`
  const log = git('log', '--format=%H\t%ad', '--date=short', '--', rel)
  if (!log) return null
  const commits = log.split('\n').map((l) => {
    const [sha, date] = l.split('\t')
    const files = git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean)
    const folders = new Set(
      files
        .filter((f) => f.startsWith('src/diversions/'))
        .map((f) => f.split('/')[2]),
    )
    const subject = git('show', '-s', '--format=%s', sha)
    return { sha, date, subject, batch: folders.size, sweep: folders.size > SWEEP_THRESHOLD }
  })
  // The OLDEST commit is the piece's birth. Judging it by folder count would call
  // every batch-shipped diversion "swept" and report zero attention ever paid to it,
  // when in fact the batch size is itself the signal worth reporting.
  const birth = commits[commits.length - 1]
  const after = commits.slice(0, -1)
  const own = after.filter((c) => !c.sweep)
  return {
    born: birth.date,
    bornInBatchOf: birth.batch,
    lastOwn: own[0]?.date ?? null,
    ownCount: own.length,
    sweptCount: after.length - own.length,
    recent: own.slice(0, 3).map((c) => `${c.date} ${c.subject}`),
  }
}

// ------------------------------------------------------------------------ credit

function credit(slug, description) {
  const hits = []
  for (const [file, text] of sources(slug)) {
    text.split('\n').forEach((line, i) => {
      if (!/^\s*(\/\/|\*|\/\*)/.test(line)) return
      // Two tiers, because explicit phrasing misses the commonest form. genetic-image
      // credits its original as `Roger Alsing's "evolving Mona Lisa"` — a possessive
      // name and no marker word at all, which the phrase list alone reads as original.
      const explicit = CREDIT_MARKERS.test(line) || CREDIT_AFTER.test(line)
      const named = i < 30 && PERSON_NAME.test(line)
      if (!explicit && !named) return
      hits.push({
        where: `${file}:${i + 1}`,
        certain: explicit,
        line: line.replace(/^\s*(\/\/|\*|\/\*)\s?/, '').trim(),
      })
    })
  }
  const galleryPath = path.join(ROOT, 'docs/gallery.md')
  const galleryLine = fs.existsSync(galleryPath)
    ? fs
        .readFileSync(galleryPath, 'utf8')
        .split('\n')
        .find((l) => l.includes(`/d/${slug}/play`))
    : undefined
  const attributed = (text) =>
    Boolean(text) && (CREDIT_MARKERS.test(text) || CREDIT_AFTER.test(text) || PERSON_NAME.test(text))
  // The card gets the SAME two tests the source comments get. Applying only the
  // phrase list here read "Jonathan McCabe's multi-scale Turing patterns" and
  // "by Clifford Reiter's snow-growth rule" as uncredited originals — the exact
  // possessive-name shape PERSON_NAME exists for, on the one surface that ships.
  const inGallery = attributed(galleryLine)
  const inCard = attributed(description)

  // Three tiers, and the middle one is deliberately split by CONFIDENCE. An explicit
  // marker ("clean-room port of", "xscreensaver") is proof there is someone to credit;
  // a bare name in a comment is only a candidate, and stating those as strongly would
  // put a false alarm on ~60 of the 137 — noise that trains the reader to skip the row.
  const explicit = hits.some((h) => h.certain)
  let tier
  if (inCard) tier = 'on the card — a viewer sees it'
  else if (explicit || inGallery)
    tier =
      'SOURCE/DOCS ONLY — no viewer ever sees it. Siblings (boxcar2d, voronoi, ' +
      'vermiculate) put the credit in meta.description; this one should probably too.'
  else if (hits.length) tier = 'possible attribution in the source — judge whether it needs crediting'
  else tier = 'nothing found — either genuinely original, or an uncredited port'
  return { tier, hits: hits.slice(0, 3), inGallery, inCard }
}

// ---------------------------------------------------------------------- schema

/** Flatten a diversion schema into leaf descriptors, walking `ui:'group'` objects. */
function leaves(schema, prefix = '') {
  const out = []
  for (const [name, node] of Object.entries(schema.shape ?? {})) {
    const meta = node.meta?.() ?? {}
    if (meta.ui === 'group') {
      let inner = node
      while (inner && !inner.shape && inner.unwrap) inner = inner.unwrap()
      if (inner?.shape) {
        out.push(...leaves(inner, `${prefix}${name}.`))
        continue
      }
    }
    out.push({ name, path: `${prefix}${name}`, meta })
  }
  return out
}

// No TRAILING \b: braid's label is "Rotation", which `rotat\b` cannot match. The
// leading \b still stops `rate` matching "generate".
const SPEED_LABEL = /\b(speed|tempo|pace|rate|per frame|steps? ?\/|fps|velocity|drift|spin|rotat)/i
// `drift` and `rate` also appear in labels naming a distance or a count — "Drift
// radius" is not a pace. Excluded rather than dropped from SPEED_LABEL, because
// "Field drift" and "Drift speed" genuinely are the tempo control on some pieces.
const NOT_A_PACE = /\b(radius|size|width|height|count|amount|length|distance|scale|threshold)\b/i

function speed(fields, defaults) {
  const show = (f) => {
    const v = valueAt(defaults, f.path)
    const range = f.meta.min !== undefined ? ` ${f.meta.min}..${f.meta.max}` : ''
    return `${f.meta.label ?? f.name} (${f.name})${range} = ${JSON.stringify(v)}`
  }
  // Test the field NAME as well as the label. Three pieces carry a pace slider whose
  // label does not say so — braid's `rotationSpeed` is labelled "Rotation", penrose's
  // `spin` is "Spin", hypercube has four `speed*` axes — and all three were reported
  // as having no speed control at all.
  const paces = fields.filter((f) => !NOT_A_PACE.test(f.meta.label ?? ''))
  // camelCase has no word boundary at the hump, so `\bspeed` cannot match
  // `rotationSpeed` until the name is split back into words.
  const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const named = paces.filter(
    (f) => SPEED_LABEL.test(f.meta.label ?? '') || SPEED_LABEL.test(words(f.name)),
  )
  if (named.length) return { kind: 'named', text: named.map(show).join(' · ') }
  const proxy = paces.filter((f) => SPEED_LABEL.test(f.meta.help ?? ''))
  return { kind: proxy.length ? 'proxy' : 'none', text: proxy.map(show).join(' · ') }
}

// -------------------------------------------------------------------- contrast

const relLum = (hex) => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  if (!m) return null
  const ch = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2])
}

/** `fg` over `ground`, honouring an 8-hex stop's alpha. A translucent colour is never
 *  seen at full strength, so measuring its raw hex reports a contrast the viewer never
 *  gets: flow-field and substrate both printed "all clear" while 3 and 6 of their
 *  stops respectively fail once composited. */
const composite = (fg, ground) => {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(fg.trim())
  if (!m || !m[2]) return fg
  const a = parseInt(m[2], 16) / 255
  const mix = [0, 2, 4].map((i) => {
    const f = parseInt(m[1].slice(i, i + 2), 16)
    const g = parseInt(ground.replace('#', '').slice(i, i + 2), 16)
    return Math.round(a * f + (1 - a) * g)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${mix.join('')}`
}

const contrastRatio = (fg, ground) => {
  const [la, lb] = [relLum(composite(fg, ground)), relLum(ground)]
  if (la === null || lb === null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** The default value of a leaf, by its dotted path. Groups nest exactly one level. */
const valueAt = (defaults, dotted) => {
  const [top, second] = dotted.split('.')
  return second === undefined ? defaults[top] : defaults[top]?.[second]
}

/** Every default colour in the config, against the default background. */
function contrastReport(fields, defaults) {
  const bgField = fields.find((f) => f.name === 'background' && f.meta.ui === 'color')
  if (!bgField) {
    // Do NOT claim the palette paints every pixel — that reason was never checked, and
    // 6 of the 37 pieces reaching here name their ground something else entirely
    // (forest-fire `ground`, aurora `skyZenith`, boxcar2d `color.sky`).
    const alt = fields.filter((f) => f.meta.ui === 'color' && /ground|sky|paper|canvas|base/i.test(f.name))
    return {
      skipped:
        'no field named `background` — not measured' +
        (alt.length ? `. Possible ground under another name: ${alt.map((f) => f.name).join(', ')}` : ''),
    }
  }
  // Two-level read, matching the swatch loop below. Reading only the top-level key
  // made every nested `color.background` resolve to an OBJECT and report "background
  // default is not a hex string" — false for 14 pieces, whose grounds are ordinary
  // hexes (halo #04060b, moire #05060a).
  const ground = valueAt(defaults, bgField.path)
  if (typeof ground !== 'string') return { skipped: 'background default is not a hex string' }

  const swatches = []
  for (const f of fields) {
    if (f.path === bgField.path) continue
    const value = valueAt(defaults, f.path)
    if (f.meta.ui === 'color' && typeof value === 'string') swatches.push([f.meta.label ?? f.name, value])
    if (f.meta.ui === 'colorList' && Array.isArray(value))
      value.forEach((c, i) => swatches.push([`${f.meta.label ?? f.name}[${i}]`, c]))
  }
  if (!swatches.length) return { ground, skipped: 'no colour fields to measure' }

  const scored = swatches.map(([label, hex]) => ({ label, hex, ratio: contrastRatio(hex, ground) }))
  const measured = scored.filter((c) => c.ratio !== null)
  const unreadable = scored.filter((c) => c.ratio === null).map((c) => c.label)
  // Reported rather than dropped: silently filtering them shrank the "N colours"
  // figure with no sign anything was skipped, and emptying the array entirely made
  // `worst` undefined, which threw mid-brief and abandoned every remaining slug.
  if (!measured.length) return { ground, skipped: `no readable colours (${unreadable.join(', ')})` }
  const low = measured.filter((c) => c.ratio < MIN_CONTRAST)
  return {
    ground,
    count: measured.length,
    unreadable,
    low,
    worst: measured.slice().sort((a, b) => a.ratio - b.ratio)[0],
  }
}

// -------------------------------------------------------------------- the ledger

function ledger() {
  try {
    const body = JSON.parse(
      execFileSync('gh', ['issue', 'view', LEDGER_ISSUE, '--json', 'body'], { cwd: ROOT, encoding: 'utf8' }),
    ).body
    const done = new Set()
    const all = []
    for (const line of body.split('\n')) {
      const m = /^- \[([ xX])\] .*\/d\/([a-z0-9-]+)\/play/.exec(line)
      if (!m) continue
      all.push(m[2])
      if (m[1] !== ' ') done.add(m[2])
    }
    // Non-vacuity guard. If the issue body's shape ever drifts, this parses to nothing
    // and `--unaudited` cheerfully prints "0/0 ticked" while `--next` re-serves the
    // same slug forever — a silent stall that looks like normal operation.
    const disk = slugsOnDisk()
    if (all.length !== disk.length) {
      throw new Error(
        `#${LEDGER_ISSUE} lists ${all.length} diversions but ${disk.length} are on disk — ` +
          `the ledger and the gallery have diverged, or the checklist format changed.`,
      )
    }
    return { all, done }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------------- brief

async function brief(slug, server) {
  const dir = path.join(DIVERSIONS, slug)
  if (!fs.existsSync(path.join(dir, 'meta.ts'))) {
    console.error(`No such diversion: ${slug}`)
    process.exitCode = 1
    return
  }
  const { meta } = await server.ssrLoadModule(`/src/diversions/${slug}/meta.ts`)
  const mod = await server.ssrLoadModule(`/src/diversions/${slug}/index.ts`)
  const diversion = mod.default

  const fields = leaves(diversion.schema)
  const defaults = diversion.schema.parse({})
  const h = history(slug)
  const cr = credit(slug, meta.description)
  const sp = speed(fields, defaults)
  const con = contrastReport(fields, defaults)
  const src = sources(slug)
  const allSource = src.map(([, t]) => t).join('\n')

  const helped = fields.filter((f) => f.meta.help).length
  const sections = [...new Set(fields.map((f) => f.meta.section).filter(Boolean))]
  // Inert-control check: is there a READ of this field anywhere — `cfg.name`, or a
  // destructuring that names it? Four earlier versions were each wrong differently,
  // and the failures were all silent:
  //
  //   1. Searching every source was vacuous — a name always matches its own
  //      declaration, so it reported 0 across all 137 and read as "no dead controls".
  //   2. Excluding schema.ts called primordial's `stepSize` dead, when schema.ts:66
  //      derives a velocity from it.
  //   3. A bare mention count was defeated by any second occurrence at all: a field
  //      named in a preset patch, or one sharing a word with an unrelated local.
  //   4. Requiring a bare word still matched an unrelated local of the same name.
  //
  // A property read or a destructure is the narrowest shape that means "the sim
  // consults this", but it is still TEXT, not a parse, and three things hide a genuinely
  // dead field from it: a dynamic `cfg[key]` read, a preset patch that sets the field
  // (not a read, but it looks like one), and a name that collides with a property or
  // method on any other object — a field named `scale` is covered by `ctx.scale(S, S)`.
  // So a flag is worth chasing and silence proves little; this is a prompt, not a proof.
  const reads = (name) =>
    new RegExp(`\\.${name}\\b|\\{[^{}]*\\b${name}\\b[^{}]*\\}`).test(allSource)
  const dead = fields.filter((f) => !reads(f.name))
  const hooks = ['update', 'resize', 'teardown', 'onPointer', 'reconcile', 'shouldRestart', 'resumeConfig']
    .filter((k) => typeof diversion[k] === 'function')
  const loop = /reseed|respawn|restart|nextTarget|cycle|phase|generation|regrow/i.exec(allSource)

  // docs/gallery.md is hand-maintained, so its link text drifts from meta.title —
  // 11 of the 137 disagreed when this check was written. The card is what ships.
  const galleryMd = fs.readFileSync(path.join(ROOT, 'docs/gallery.md'), 'utf8')
  const linkText = new RegExp(`\\[([^\\]]+)\\]\\(https://[^)]*/d/${slug}/play\\)`).exec(galleryMd)?.[1]
  const nameDrift = linkText && linkText !== meta.title ? linkText : null

  const fam = Object.entries(FAMILIES)
    .filter(([, re]) => re.test(`${meta.title} ${meta.description}`))
    .map(([name]) => name)

  console.log('')
  console.log(`━━ ${meta.title}   (${slug} · ${meta.kind})`)
  console.log(`   play    ${LIVE}/d/${slug}/play`)
  console.log(`   config  ${LIVE}/d/${slug}`)
  console.log(`   dev     ${DEV}/d/${slug}/play`)
  console.log('')
  console.log(row('📇', 'Card', `"${meta.description}"`))
  console.log(
    row(
      '🕰️',
      'History',
      h
        ? `born ${h.born}` +
          (h.bornInBatchOf > 1 ? ` in a batch of ${h.bornInBatchOf} diversions` : '') +
          ` · since then: ${h.ownCount} commit(s) of its own, ${h.sweptCount} repo-wide sweep(s)` +
          (h.ownCount === 0
            ? `\nnever revisited — nothing but repo-wide sweeps has touched it since it shipped`
            : `\n` + h.recent.map((r) => `  ${r}`).join('\n'))
        : 'no git history',
    ),
  )
  console.log(row('©', 'Credit', cr.tier))
  for (const hit of cr.hits)
    console.log(`                ${hit.certain ? ' ' : '?'} ${hit.where}  "${hit.line.slice(0, 68)}"`)
  console.log(
    row(
      '⏱️',
      'Speed',
      sp.kind === 'named'
        ? sp.text
        : sp.kind === 'proxy'
          ? `NO speed-labelled control. Closest proxy: ${sp.text}`
          : 'NO speed control and no proxy — the pace is hardcoded',
    ),
  )
  console.log(
    row('🔁', 'Longevity', loop ? `loop symbols present: ${loop[0]}` : 'NO reseed/cycle symbol found — may run to a dead end'),
  )
  console.log(
    row(
      '🎛️',
      'Settings',
      `${fields.length} fields · help ${helped}/${fields.length} · sections ${sections.join(', ') || '(none)'}` +
        `\n              hooks: ${hooks.join(', ') || 'none (every change re-runs setup)'}` +
        (dead.length ? `\n              ⚠ declared but never read (inert control): ${dead.map((f) => f.name).join(', ')}` : ''),
    ),
  )
  console.log(
    row(
      '🎨',
      'Presets',
      diversion.presets?.length
        ? diversion.presets.map((g) => `${g.label} (${g.options.length})`).join(' · ')
        : 'none declared — nothing to reach a curated look with',
    ),
  )
  console.log(
    row(
      '🔦',
      'Contrast',
      con.skipped
        ? `${con.ground ? `ground ${con.ground} · ` : ''}${con.skipped}`
        : `ground ${con.ground} · ${con.count} colours · worst ${con.worst.label} ` +
          `${con.worst.ratio.toFixed(2)}:1` +
          (con.unreadable.length ? ` · unreadable: ${con.unreadable.join(', ')}` : '') +
          (con.low.length
            ? `\n${con.low.length} under the ${MIN_CONTRAST} floor: ` +
              con.low.map((s) => `${s.label} ${s.ratio.toFixed(2)}`).join(', ') +
              `\nA shadow or backdrop stop is often MEANT to be near-invisible (asteroids' nebula ` +
              `is ordered dark-to-light on purpose). Declared colours are also not rendered pixels — ` +
              `blending, trails and glow all move them. Look before believing this.`
            : ` — all clear the ${MIN_CONTRAST} floor`),
    ),
  )
  console.log(row('👥', 'Family', fam.length ? fam.join(' · ') : 'unclassified'))
  if (nameDrift)
    console.log(row('🏷️', 'Name', `docs/gallery.md calls it "${nameDrift}" — meta.title is "${meta.title}"`))
  console.log('')
  console.log('   Judge: interesting · worth keeping · settings sane · speed · card-vs-reality')
  console.log('   Look at 0:10 and again at 2:00, and reload 2-3x (a fresh seed each visit).')
  console.log('')
}

// -------------------------------------------------------------------------- main

const args = process.argv.slice(2)
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  if (args[0] === '--unaudited' || args[0] === '--next') {
    const led = ledger()
    if (!led) {
      console.error(`Could not read issue #${LEDGER_ISSUE} (needs \`gh\`). Pass a slug instead.`)
      process.exitCode = 1
    } else {
      const left = slugsOnDisk().filter((s) => !led.done.has(s))
      if (args[0] === '--unaudited') {
        console.log(`${led.done.size}/${led.all.length} ticked · ${left.length} left`)
        console.log(left.join('\n'))
      } else if (!left.length) {
        console.log('Everything is ticked. 🎉')
      } else {
        await brief(left[0], server)
      }
    }
  } else if (args.length) {
    for (const slug of args) {
      try {
        await brief(slug, server)
      } catch (err) {
        // A batch run is the normal way this is used; letting one piece's failure
        // abandon the remaining 136 briefs silently would be the worst outcome.
        console.log(`\n━━ ${slug}\n   ⚠ could not brief this piece: ${err.message}\n`)
        process.exitCode = 1
      }
    }
  } else {
    console.error('Usage: node scripts/audit-preflight.mjs <slug> | --next | --unaudited')
    process.exitCode = 1
  }
} finally {
  await server.close()
}
