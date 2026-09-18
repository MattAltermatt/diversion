import { mulberry32 } from '../../framework/rng'
import { bundle, wobble, type Pt } from './geometry'
import {
  diamond, drop, hatchSquare, hatchTri, leaf, roundedSquare, scallopRing, spiralHook, wavyRing,
} from './motifs'
import { POWDER, type KolamConfig } from './config'

// ─────────────────────────────────────────────────────────────────────────────
// THE GRAMMAR IS FIXED; THE CONTENT IS GENERATED.
//
// Always, drawn outward: centre → middle registers → terminals → lace → kaavi.
// Randomising the STRUCTURE buys variety and spends the identity — it stops
// reading as a kolam and starts reading as generic radial ornament. What varies
// is everything inside that skeleton.
//
// ⚠️ Two anti-mush rules, and they are the design. Registers drawing freely from
// the full motif set give a stack of unrelated ornament no single hand would
// have drawn — more varied, much worse. Each drawing picks 2–3 motifs and builds
// every register from only those, and picks 2–3 chalks the same way.
// ─────────────────────────────────────────────────────────────────────────────

export type Role =
  | 'centre' | 'band' | 'ring' | 'terminal' | 'lace' | 'laceNest' | 'inter' | 'kaavi'

export interface Stroke {
  pts: Pt[]
  closed: boolean
  col: string
  role: Role
  cum: number[]
  len: number
}

export interface Composition {
  strokes: Stroke[]
  total: number
  cx: number
  cy: number
  Rmax: number
  vocab: string[]
  chalks: string[]
  nMid: number
  types: ('band' | 'ring')[]
  /** Every angular repeat used, for the symmetry guarantee. Tested on INTEGERS:
   *  two geometric detectors were written during design and both were wrong, one
   *  of them failing its own positive control. */
  repeats: number[]
}

const MOTIF_KINDS = ['leaf', 'drop', 'tri', 'curl', 'diamond'] as const

/** The exposed 0–1 maps onto the live range. The raw gates are 0.18 / 0.62 /
 *  0.70, so an unmapped slider's bottom 18% is a no-op. Plateaus remain — three
 *  gates on one slider cannot give every position an effect. */
const liveDensity = (d: number) => 0.18 + d * 0.82

/** Below this the drawing reads as thin and scattered — the sparse tail that
 *  bands exist to prevent. 15.7% of unfloored draws fell under it. */
const STROKE_FLOOR = 70

type Draw = (tag: string) => number

const shuffled = <T>(arr: readonly T[], draw: Draw, tag: string): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (draw(tag) * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function runBuild(
  cfg: KolamConfig, width: number, height: number, seed: number, tags: string[] | null,
): Composition {
  const rawRng = mulberry32(seed >>> 0)
  // ⚠️ COLOUR RUNS ON ITS OWN STREAM. `chalkFor` consumes one draw when it
  // returns white and two when it returns a chalk, inside the register loop and
  // interleaved with wobble(). Sharing the main stream made `colouredChalk`
  // re-generate the GEOMETRY in 101 of 200 seeds — a colour slider silently
  // re-rolling the drawing, which is the Salvage #319 failure from the Color
  // section. Separate streams make every colour field provably geometry-safe.
  const rawCol = mulberry32((seed ^ 0xa5a5a5a5) >>> 0)
  const rng: Draw = (tag) => { const v = rawRng(); if (tags) tags.push(tag); return v }
  const colRng: Draw = (tag) => { const v = rawCol(); if (tags) tags.push('c/' + tag); return v }

  const cx = width / 2, cy = height / 2
  const Rmax = Math.min(width, height) * 0.42
  const N = cfg.symmetry
  const D = liveDensity(cfg.density)
  const wob = cfg.handWobble * (Rmax / 400) * 2.2
  const strokes: Stroke[] = []
  const repeats: number[] = []
  const R = (f: number) => Rmax * f

  let curCol = POWDER
  let curRole: Role = 'centre'

  const add = (base: Pt[], closed: boolean, col: string | null, count?: number, gapScale?: number) => {
    // Tag wobble BY ROLE, or 150 of the golden vector's 240 prefix entries are
    // the same token and a transposition between two add() calls is invisible.
    const w = wobble(base, wob, () => rng('wobble@' + curRole), closed)
    const g = cfg.bundleSpacing * (Rmax / 400) * (gapScale ?? 1)
    for (const b of bundle(w, count ?? cfg.strokesPerBundle, g, closed)) {
      strokes.push({ pts: b.pts, closed: b.closed, col: col ?? curCol, role: curRole, cum: [], len: 0 })
    }
  }

  const vocab = shuffled(MOTIF_KINDS, rng, 'vocabShuffle').slice(0, rng('vocabSize') < 0.45 ? 2 : 3)
  const pick = () => vocab[(rng('motifPick') * vocab.length) | 0]

  const chalks = shuffled(cfg.palette, colRng, 'chalkShuffle')
    .slice(0, colRng('chalkSize') < 0.5 ? 2 : 3)
  // ⚠️ Chosen PER REGISTER, never per instance: every copy of a motif in one
  // symmetric orbit must share a colour, or the N-fold symmetry the whole
  // composition rests on is broken by the property the eye reads fastest.
  const chalkFor = () =>
    (colRng('chalkGate') < cfg.colouredChalk ? chalks[(colRng('chalkPick') * chalks.length) | 0] : POWDER)

  const placeRing = (
    r: number, repeat: number, phase: number, motif: string, size: number,
    count: number, gapScale: number,
  ) => {
    repeats.push(repeat)
    for (let i = 0; i < repeat; i++) {
      const a = phase + (i / repeat) * Math.PI * 2
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r
      if (motif === 'curl') {
        add(spiralHook(px, py, a + 1.2, size * 1.1, 1.4), false, null, count, gapScale)
      } else if (motif === 'tri') {
        const t = hatchTri(px, py, a, size * 2.3, size * 0.9)
        add(t.outline, true, null, count, gapScale)
        // Hatching bypasses bundle() — a bundled hatch is a solid block, and a
        // bare 2-point line vanishes inside bundle() at every count.
        for (const [p1, p2] of t.hatch) {
          strokes.push({ pts: [p1, p2], closed: false, col: curCol, role: curRole, cum: [], len: 0 })
        }
      } else {
        const fn = motif === 'drop' ? drop : motif === 'diamond' ? diamond : leaf
        add(fn(px, py, a, size * 2.4, size * 0.9), true, null, count, gapScale)
      }
    }
  }

  // ── 1. the centre, always. Structure: rice white. ──────────────────────────
  curRole = 'centre'
  curCol = POWDER
  const centreR = 0.12 + rng('centreR') * 0.05
  add(roundedSquare(cx, cy, R(centreR), 3.0 + rng('centreP') * 3.0), true, null, 3, 0.42)
  if (rng('centreHatch') < 0.75) {
    for (const [p1, p2] of hatchSquare(cx, cy, R(centreR * 0.62), Math.PI / 4, Math.max(3, R(0.013)))) {
      strokes.push({ pts: [p1, p2], closed: false, col: POWDER, role: 'centre', cum: [], len: 0 })
    }
  }

  // ── 2. the middle registers ───────────────────────────────────────────────
  const nMid = 3 + ((rng('nMid') * Math.max(1, cfg.registers - 2)) | 0)
  const inner = centreR + 0.07, outerLimit = 0.78
  const radii: number[] = []
  for (let i = 0; i < nMid; i++) {
    const t = nMid === 1 ? 0.5 : i / (nMid - 1)
    radii.push(inner + t * (outerLimit - inner) + (rng('radiusJitter') - 0.5) * 0.045)
  }
  // ⚠️ Bands are the ARMATURE. A mostly-ring draw reads as scattered — motifs
  // floating with no continuous line tying them together. Bias toward bands and
  // guarantee two; removing the top-up loop drops 23% of draws below two.
  const types: ('band' | 'ring')[] = radii.map(() => (rng('bandGate') < 0.58 ? 'band' : 'ring'))
  let bands = types.filter((t) => t === 'band').length
  for (let i = 0; bands < Math.min(2, nMid) && i < nMid; i++) {
    const j = (((nMid / 2) | 0) + i) % nMid
    if (types[j] !== 'band') { types[j] = 'band'; bands++ }
  }

  radii.forEach((r, i) => {
    // ⚠️ Colour never goes on STRUCTURE. A band in coloured chalk is at once the
    // lowest-contrast form the generator can make and the line the eye reads the
    // composition from. Every reference photograph keeps it white.
    curRole = types[i]
    curCol = types[i] === 'band' ? POWDER : chalkFor()
    const prev = i === 0 ? centreR : radii[i - 1]
    const next = i === nMid - 1 ? 0.86 : radii[i + 1]
    const room = Math.min(r - prev, next - r)

    if (types[i] === 'band') {
      const lobes = N % 2 === 0 && rng('lobeGate') < 0.6 ? N / 2 : N
      repeats.push(lobes)
      const amp = 0.035 + rng('bandAmp') * 0.09
      const thick = Math.max(2, Math.round(cfg.strokesPerBundle * (0.55 + rng('bandThick') * 0.45)))
      if (rng('bandShape') < 0.22) {
        add(roundedSquare(cx, cy, R(r), 3.0 + rng('bandP') * 2.5), true, null, thick, 1)
      } else {
        add(wavyRing(cx, cy, R(r), lobes, amp), true, null, thick, 1)
      }
    } else {
      const m = 1 + ((rng('ringMult') * (r > 0.5 ? 2.99 : 1.99)) | 0)
      const repeat = N * m
      const phase = rng('ringPhase') < 0.5 ? 0 : Math.PI / repeat
      placeRing(R(r), repeat, phase, pick(), R(room * 0.40), rng('ringCount') < 0.4 ? 2 : 1, 0.34)
    }
  })

  // ── 3. corner terminals, sometimes ────────────────────────────────────────
  if (rng('terminalGate') < 0.55) {
    curRole = 'terminal'
    curCol = chalkFor()
    // ⚠️ `k` must SHARE N's factors. A literal 4 was the single line that broke
    // the composition's symmetry: against N = 6 or 10 it drives gcd to 1, so half
    // of all draws at those symmetries had NO rotational symmetry at all.
    const k = rng('terminalK') < 0.5 ? N / 2 : N
    repeats.push(k)
    const tr = 0.80 + rng('terminalR') * 0.04
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + Math.PI / k
      add(spiralHook(cx + Math.cos(a) * R(tr), cy + Math.sin(a) * R(tr), a + 1.2,
                     R(0.07 + rng('terminalSize') * 0.03)), false, null, 2, 0.40)
    }
  }

  // ── 4. the outer lace, always — a motif nested in every scallop ───────────
  curRole = 'lace'
  curCol = POWDER // the lace is the frame; structure stays rice white
  const laceN = N * (rng('laceMult') < 0.5 ? 2 : 3)
  repeats.push(laceN)
  const laceR = 0.86, laceD = 0.04 + rng('laceDepth') * 0.03
  add(scallopRing(cx, cy, R(laceR), laceN, R(laceD)), true, null, 3, 0.55)

  curRole = 'laceNest'
  const nested = vocab.includes('drop') ? 'drop' : pick()
  const nestCol = chalkFor()
  repeats.push(laceN)
  for (let i = 0; i < laceN; i++) {
    const a = (i / laceN) * Math.PI * 2 + Math.PI / laceN
    const rr = R(laceR + laceD * 0.7)
    if (nested === 'curl') {
      add(spiralHook(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + 2.4, R(0.022)), false, nestCol, 1)
    } else {
      const fn = nested === 'diamond' ? diamond : nested === 'leaf' ? leaf : drop
      add(fn(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + Math.PI, R(0.050), R(0.019)),
          true, nestCol, 1)
    }
    if (D > 0.62) {
      const r2 = rr - R(0.026)
      add(leaf(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, a, R(0.016), R(0.007)), true, null, 1)
    }
  }

  // ── 5. interstitial fill — bare ground between registers is the largest
  //       remaining difference from the reference photographs ────────────────
  if (D > 0.18) {
    curRole = 'inter'
    const bounds = [centreR, ...radii, laceR]
    for (let i = 0; i < bounds.length - 1; i++) {
      const gap = bounds[i + 1] - bounds[i]
      if (gap < 0.11) continue
      if (rng('interGate') > 0.35 + D * 0.6) continue
      curCol = chalkFor()
      const mid = (bounds[i] + bounds[i + 1]) / 2
      const m = mid > 0.5 && D > 0.7 ? 2 : 1
      const repeat = N * m
      placeRing(R(mid), repeat, Math.PI / repeat, pick(), R(gap * 0.22), 1, 0.30)
    }
  }

  // ── 6. kaavi: one heavy red line just outside everything ──────────────────
  if (cfg.kaavi) {
    curRole = 'kaavi'
    const k = scallopRing(cx, cy, R(0.955), laceN, R(0.05))
    strokes.push({
      pts: wobble(k, wob * 0.6, () => rng('wobble@kaavi'), true),
      closed: true, col: cfg.kaaviColor, role: 'kaavi', cum: [], len: 0,
    })
  }

  // ── arc-length parameterise ───────────────────────────────────────────────
  let total = 0
  for (const s of strokes) {
    const p = s.pts
    if (s.closed && p.length) p.push({ x: p[0].x, y: p[0].y })
    s.cum = [0]
    let L = 0
    for (let i = 1; i < p.length; i++) {
      L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)
      s.cum.push(L)
    }
    s.len = L
    total += L
  }
  return { strokes, total, cx, cy, Rmax, vocab, chalks, nMid, types, repeats }
}

/** Build a kolam. `seed` is the authority; `cfg.seed` is ignored here so tests
 *  can sweep — `index.ts` passes `cfg.seed`.
 *
 *  ⚠️ The FLOOR retry is inside this function, not the caller's, so the
 *  instrumented stream in `recordDraws` covers it too. */
export function buildComposition(
  cfg: KolamConfig, width: number, height: number, seed: number,
): Composition {
  let c = runBuild(cfg, width, height, seed, null)
  if (c.strokes.length >= STROKE_FLOOR) return c
  for (const bump of [1, 2] as const) {
    c = runBuild({ ...cfg, registers: Math.min(6, cfg.registers + bump) }, width, height, seed, null)
    if (c.strokes.length >= STROKE_FLOOR) return c
  }
  for (const d of [0.7, 1] as const) {
    c = runBuild({ ...cfg, registers: Math.min(6, cfg.registers + 2), density: d },
                 width, height, seed, null)
    if (c.strokes.length >= STROKE_FLOOR) return c
  }
  return c
}

/** The same build, with every `rng()` call site logging its tag.
 *
 *  ⚠️ It must route through the SAME function `buildComposition` calls, or the
 *  floor-retry loop is uninstrumented. And the guard snapshots TAGS, not values:
 *  a PRNG's output sequence is invariant under consumer reordering, so a plain
 *  draw log is byte-identical whether or not two rng() calls are transposed. */
export function recordDraws(
  cfg: KolamConfig, width: number, height: number, seed: number,
): { tags: string[] } {
  const tags: string[] = []
  runBuild(cfg, width, height, seed, tags)
  return { tags }
}
