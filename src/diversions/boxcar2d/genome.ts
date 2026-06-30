export const N_VERTICES = 8
export const N_WHEELS = 2

export interface Wheel { present: boolean; vertex: number; radius: number; density: number }
export interface Genome { mags: number[]; chassisDensity: number; wheels: Wheel[] }

export interface GenomeRanges {
  magMin: number; magMax: number
  densMin: number; densMax: number
  wheelRMin: number; wheelRMax: number
  wheelDensMin: number; wheelDensMax: number
}

// 🎚️ tunable defaults (meters / density). Wide ranges → varied, often-absurd
// gen-1 cars (lopsided bodies, odd wheels) so the junk→competent arc is vivid.
export const DEFAULT_RANGES: GenomeRanges = {
  magMin: 0.2, magMax: 1.4,
  densMin: 0.5, densMax: 3,
  wheelRMin: 0.15, wheelRMax: 0.65,
  wheelDensMin: 0.5, wheelDensMax: 2,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function randomGenome(rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  const mags = Array.from({ length: N_VERTICES }, () => lerp(r.magMin, r.magMax, rng()))
  const chassisDensity = lerp(r.densMin, r.densMax, rng())
  const wheels: Wheel[] = Array.from({ length: N_WHEELS }, () => ({
    present: rng() < 0.6, // a mix of 1- and 2-wheel cars (never 0 — see below)
    vertex: Math.floor(rng() * N_VERTICES),
    radius: lerp(r.wheelRMin, r.wheelRMax, rng()),
    density: lerp(r.wheelDensMin, r.wheelDensMax, rng()),
  }))
  ensureAWheel(wheels)
  return { mags, chassisDensity, wheels }
}

/** Every car gets at least one wheel so it can at least *try* to move (no
 *  motionless 0-wheel duds that just sit out their death timer). */
function ensureAWheel(wheels: Wheel[]): void {
  if (!wheels.some((w) => w.present)) wheels[0].present = true
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const pick = <T,>(x: T, y: T) => (rng() < 0.5 ? x : y)
  return {
    mags: a.mags.map((m, i) => pick(m, b.mags[i])),
    chassisDensity: pick(a.chassisDensity, b.chassisDensity),
    wheels: a.wheels.map((w, i) => ({
      present: pick(w.present, b.wheels[i].present),
      vertex: pick(w.vertex, b.wheels[i].vertex),
      radius: pick(w.radius, b.wheels[i].radius),
      density: pick(w.density, b.wheels[i].density),
    })),
  }
}

export function mutate(g: Genome, rate: number, rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  // jitter as a fraction of the gene's range when the per-gene roll fires
  const jit = (v: number, lo: number, hi: number) =>
    rng() < rate ? clamp(v + (rng() * 2 - 1) * (hi - lo) * 0.25, lo, hi) : v
  const wheels = g.wheels.map(w => ({
    present: rng() < rate ? !w.present : w.present,
    vertex: rng() < rate ? Math.floor(rng() * N_VERTICES) : w.vertex,
    radius: jit(w.radius, r.wheelRMin, r.wheelRMax),
    density: jit(w.density, r.wheelDensMin, r.wheelDensMax),
  }))
  ensureAWheel(wheels)
  return {
    mags: g.mags.map(m => jit(m, r.magMin, r.magMax)),
    chassisDensity: jit(g.chassisDensity, r.densMin, r.densMax),
    wheels,
  }
}
