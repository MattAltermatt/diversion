import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

/** Smallest power-of-two dim with dim*dim >= count (min 16). The agent texture
 *  is square and pow2, so it holds at least `count` agents (surplus texels are
 *  inert real agents — harmless). */
export function texDimFor(count: number): number {
  let d = 16
  while (d * d < count) d *= 2
  return d
}

/** Deterministic seeded agent init. Returns a Float32Array sized to the pow2
 *  agent texture: per texel (x, y, heading, 0). x,y in [0,1); heading in [0,2π). */
export function initAgents(seed: number, count: number): Float32Array {
  const dim = texDimFor(count)
  const rng = mulberry32(seed)
  const out = new Float32Array(dim * dim * 4)
  for (let i = 0; i < dim * dim; i++) {
    out[i * 4 + 0] = rng()
    out[i * 4 + 1] = rng()
    out[i * 4 + 2] = rng() * Math.PI * 2
    // Channel w = respawn-progress phase, randomised so agents respawn at
    // staggered times (not all at once) over the lifecycle. See gl.ts MOVE_FRAG.
    out[i * 4 + 3] = rng()
  }
  return out
}

/** Bake the density gradient into a 256×RGBA byte LUT (uploaded as a 256×1 tex). */
export function buildLUT(stops: string[]): Uint8Array {
  // sampleGradientRGBA wants hex8; widen #rrggbb → #rrggbbff.
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const c = sampleGradientRGBA(s8, i / 255)
    lut[i * 4 + 0] = Math.round(c.r)
    lut[i * 4 + 1] = Math.round(c.g)
    lut[i * 4 + 2] = Math.round(c.b)
    lut[i * 4 + 3] = 255
  }
  return lut
}
