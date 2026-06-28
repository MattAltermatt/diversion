// Shared deterministic RNG + value-noise primitives. The canonical home for the
// seeded PRNG every diversion uses (was duplicated bit-for-bit across five files)
// and the flow-field value noise. Diversions import from here; they never own a
// private copy and never import these from one another.

/** Seeded PRNG → () => float in [0, 1). Deterministic for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x)

// Integer-lattice hash → value in [-1, 1). Folds in the seed; no precomputed
// grid, so z (time) is unbounded and the field never loops.
function hash3(xi: number, yi: number, zi: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) | 0
  h = Math.imul(h ^ (xi | 0), 0x85ebca6b)
  h = Math.imul(h ^ (yi | 0), 0xc2b2ae35)
  h = Math.imul(h ^ (zi | 0), 0x27d4eb2f)
  h ^= h >>> 13
  h = Math.imul(h, 0x165667b1)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967296) * 2 - 1
}

/** Seeded 3D value noise with trilinear smooth interpolation → value in [-1, 1].
 *  Sampling z as a slowly-advancing time axis morphs the field continuously. */
export function makeNoise3D(seed: number): (x: number, y: number, z: number) => number {
  const s = seed >>> 0
  return (x: number, y: number, z: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z)
    const fx = smooth(x - x0), fy = smooth(y - y0), fz = smooth(z - z0)
    const c000 = hash3(x0, y0, z0, s), c100 = hash3(x0 + 1, y0, z0, s)
    const c010 = hash3(x0, y0 + 1, z0, s), c110 = hash3(x0 + 1, y0 + 1, z0, s)
    const c001 = hash3(x0, y0, z0 + 1, s), c101 = hash3(x0 + 1, y0, z0 + 1, s)
    const c011 = hash3(x0, y0 + 1, z0 + 1, s), c111 = hash3(x0 + 1, y0 + 1, z0 + 1, s)
    const x00 = c000 + fx * (c100 - c000)
    const x10 = c010 + fx * (c110 - c010)
    const x01 = c001 + fx * (c101 - c001)
    const x11 = c011 + fx * (c111 - c011)
    const y0v = x00 + fy * (x10 - x00)
    const y1v = x01 + fy * (x11 - x01)
    return y0v + fz * (y1v - y0v)
  }
}
