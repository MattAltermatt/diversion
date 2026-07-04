import { mulberry32 } from '../../framework/rng'
import type { VinesConfig } from './schema'

// ─── L-system + turtle graphics ──────────────────────────────────────────────
// Expand an axiom with production rules, then walk the resulting string with a
// turtle to produce a tree of line segments. Everything here is PURE and
// deterministic given the config's seed, so the same seed reproduces the same
// vine — and the geometry is built ONCE, then revealed progressively by the
// caller (segments carry their path-distance from the root, `dStart`/`dEnd`).
//
// Turtle alphabet: F = draw forward · +/- = turn left/right by branchAngle ·
// [ = push state (start a branch, depth++) · ] = pop state (return to fork).

export interface Segment {
  x0: number
  y0: number
  x1: number
  y1: number
  dStart: number // path length from the root to this segment's start
  dEnd: number // dStart + segment length
  depth: number // bracket-nesting depth → thinner + a tip when a branch ends here
  tip: boolean // endpoint is a branch tip (no further segment continues from it)
}

export interface VineGeometry {
  segments: Segment[]
  maxDist: number // longest root-to-tip path length (drives the reveal front)
  maxDepth: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface SpeciesRule {
  axiom: string
  rules: Record<string, string>
}

// Classic branching L-systems (after Prusinkiewicz & Lindenmayer, ABOP §1.6).
export const SPECIES: Record<VinesConfig['species'], SpeciesRule> = {
  bush: { axiom: 'X', rules: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' } },
  fern: { axiom: 'F', rules: { F: 'FF-[-F+F+F]+[+F-F-F]' } },
  tree: { axiom: 'F', rules: { F: 'F[+F]F[-F]F' } },
  willow: { axiom: 'F', rules: { F: 'F[+F]F[-F][F]' } },
}

const MAX_STRING = 220_000 // guard the exponential expansion
const MAX_SEGMENTS = 9000 // per-plant turtle cap (perf ceiling for redraw-per-frame)
const BASE_LEN = 10 // world units per F step at depth 0 (fit-scaled to the frame)
const STEM_SPACING = 46 // world units between adjacent seed points
const UP_BIAS = 0.045 // gentle gravitropism: nudge each step back toward "up"
const DEG = Math.PI / 180
const TAU = Math.PI * 2

/** Expand the axiom `iterations` times, guarding against runaway string length. */
export function expand(axiom: string, rules: Record<string, string>, iterations: number): string {
  let s = axiom
  for (let it = 0; it < iterations; it++) {
    let out = ''
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      out += rules[c] ?? c
      if (out.length > MAX_STRING) return out // stop growing; still a valid string
    }
    s = out
  }
  return s
}

/** Wrap an angle to (-π, π]. */
function norm(a: number): number {
  let x = a
  while (x > Math.PI) x -= TAU
  while (x <= -Math.PI) x += TAU
  return x
}

interface TurtleOpts {
  branchAngle: number // radians
  angleJitter: number // radians
  lengthDecay: number
  startX: number
  startY: number
  startHeading: number
  rng: () => number
}

/** Walk an expanded string, emitting one Segment per F. */
export function turtle(str: string, opts: TurtleOpts): Segment[] {
  const UP = -Math.PI / 2
  let x = opts.startX
  let y = opts.startY
  let heading = opts.startHeading
  let depth = 0
  let dist = 0
  const stack: { x: number; y: number; heading: number; depth: number; dist: number }[] = []
  const segs: Segment[] = []

  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === 'F') {
      const len = BASE_LEN * Math.pow(opts.lengthDecay, depth)
      // organic wander + a soft pull back toward vertical so the vine climbs
      heading += (opts.rng() * 2 - 1) * opts.angleJitter
      heading += UP_BIAS * norm(UP - heading)
      const x1 = x + Math.cos(heading) * len
      const y1 = y + Math.sin(heading) * len
      segs.push({ x0: x, y0: y, x1, y1, dStart: dist, dEnd: dist + len, depth, tip: false })
      x = x1
      y = y1
      dist += len
      if (segs.length >= MAX_SEGMENTS) break
    } else if (c === '+') {
      heading -= opts.branchAngle + (opts.rng() * 2 - 1) * opts.angleJitter * 0.5
    } else if (c === '-') {
      heading += opts.branchAngle + (opts.rng() * 2 - 1) * opts.angleJitter * 0.5
    } else if (c === '[') {
      stack.push({ x, y, heading, depth, dist })
      depth++
    } else if (c === ']') {
      const s = stack.pop()
      if (s) {
        x = s.x
        y = s.y
        heading = s.heading
        depth = s.depth
        dist = s.dist
      }
    }
  }

  // Mark tips: a segment whose endpoint is not the start of any other segment.
  const starts = new Set<string>()
  for (const s of segs) starts.add(`${s.x0},${s.y0}`)
  for (const s of segs) if (!starts.has(`${s.x1},${s.y1}`)) s.tip = true

  return segs
}

/** Build the full multi-stem geometry for a config (deterministic from seed). */
export function buildGeometry(cfg: VinesConfig): VineGeometry {
  const n = cfg.seedPoints
  const all: Segment[] = []
  for (let p = 0; p < n; p++) {
    const rng = mulberry32((cfg.seed * 2654435761 + p * 40503 + 1) >>> 0)
    const str = expand(SPECIES[cfg.species].axiom, SPECIES[cfg.species].rules, cfg.iterations)
    const lean = (rng() * 2 - 1) * 0.16 // slight per-stem lean off vertical
    const segs = turtle(str, {
      branchAngle: cfg.branchAngle * DEG,
      angleJitter: cfg.angleJitter * DEG,
      lengthDecay: cfg.lengthDecay,
      startX: (p - (n - 1) / 2) * STEM_SPACING,
      startY: 0,
      startHeading: -Math.PI / 2 + lean,
      rng,
    })
    for (const s of segs) all.push(s)
  }

  let maxDist = 0
  let maxDepth = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of all) {
    if (s.dEnd > maxDist) maxDist = s.dEnd
    if (s.depth > maxDepth) maxDepth = s.depth
    if (s.x0 < minX) minX = s.x0
    if (s.x1 < minX) minX = s.x1
    if (s.x0 > maxX) maxX = s.x0
    if (s.x1 > maxX) maxX = s.x1
    if (s.y0 < minY) minY = s.y0
    if (s.y1 < minY) minY = s.y1
    if (s.y0 > maxY) maxY = s.y0
    if (s.y1 > maxY) maxY = s.y1
  }
  if (all.length === 0) {
    minX = -1; minY = -1; maxX = 1; maxY = 1
  }
  return { segments: all, maxDist, maxDepth, minX, minY, maxX, maxY }
}
