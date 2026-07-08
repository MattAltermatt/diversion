// The genome: a fixed-size list of translucent polygons. Count and vertex
// count are user knobs (schema `polygonCount` / `verticesPerPolygon`) — the
// genome never grows or shrinks on its own, only individual polygons mutate,
// so genome shape always matches config (a shape change is a structural edit
// the framework handles via full re-setup, see geneticImage.ts `applyConfig`).

export interface PolygonGene {
  points: number[] // [x0,y0,x1,y1,...], normalized 0..1, length = verticesPerPolygon*2
  r: number // 0..255
  g: number // 0..255
  b: number // 0..255
  a: number // 0..1
}

export type Genome = PolygonGene[]

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function clampByte(x: number): number {
  return x < 0 ? 0 : x > 255 ? 255 : Math.round(x)
}

/** A small fan-shaped polygon around a random center — always a simple
 *  (non-self-intersecting) polygon, so `raster.ts`'s scanline fill is exact. */
export function randomPolygon(rng: () => number, verticesPerPolygon: number): PolygonGene {
  const cx = rng()
  const cy = rng()
  const baseAngle = rng() * Math.PI * 2
  const points: number[] = []
  for (let i = 0; i < verticesPerPolygon; i++) {
    const ang = baseAngle + (i / verticesPerPolygon) * Math.PI * 2 + (rng() - 0.5) * 0.6
    const rad = 0.04 + rng() * 0.14
    points.push(clamp01(cx + Math.cos(ang) * rad), clamp01(cy + Math.sin(ang) * rad))
  }
  return {
    points,
    r: Math.floor(rng() * 256),
    g: Math.floor(rng() * 256),
    b: Math.floor(rng() * 256),
    a: 0.12 + rng() * 0.35,
  }
}

export function randomGenome(rng: () => number, count: number, verticesPerPolygon: number): Genome {
  const genome: Genome = []
  for (let i = 0; i < count; i++) genome.push(randomPolygon(rng, verticesPerPolygon))
  return genome
}

export function cloneGenome(genome: Genome): Genome {
  return genome.map((p) => ({ points: p.points.slice(), r: p.r, g: p.g, b: p.b, a: p.a }))
}

export type MutationKind = 'vertex' | 'color'

const VERTEX_JITTER = 0.18 // fraction of canvas width/height a vertex can nudge
const COLOR_JITTER = 70 // 0..255 channel nudge range
const ALPHA_JITTER = 0.25

/** Mutate exactly one small thing on a clone of `genome` — nudge one vertex,
 *  or nudge one color/alpha channel, on one randomly-chosen polygon — and
 *  return the clone. `genome` is untouched; the caller (evolveStep) only
 *  commits the mutation if it scores no worse than the current best. */
export function mutate(genome: Genome, rng: () => number): Genome {
  const g = cloneGenome(genome)
  const pi = Math.floor(rng() * g.length)
  const poly = g[pi]
  const kind: MutationKind = rng() < 0.5 ? 'vertex' : 'color'
  if (kind === 'vertex') {
    const vi = Math.floor(rng() * (poly.points.length / 2))
    poly.points[vi * 2] = clamp01(poly.points[vi * 2] + (rng() - 0.5) * VERTEX_JITTER)
    poly.points[vi * 2 + 1] = clamp01(poly.points[vi * 2 + 1] + (rng() - 0.5) * VERTEX_JITTER)
  } else {
    const channel = Math.floor(rng() * 4)
    if (channel === 0) poly.r = clampByte(poly.r + (rng() - 0.5) * COLOR_JITTER)
    else if (channel === 1) poly.g = clampByte(poly.g + (rng() - 0.5) * COLOR_JITTER)
    else if (channel === 2) poly.b = clampByte(poly.b + (rng() - 0.5) * COLOR_JITTER)
    else poly.a = clamp01(poly.a + (rng() - 0.5) * ALPHA_JITTER)
  }
  return g
}
