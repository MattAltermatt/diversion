import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

/** Smallest pow2 dim with dim² ≥ count (min 16). The agent texture is square and
 *  pow2, so it holds at least `count` agents (surplus texels are inert). */
export function texDimFor(count: number): number {
  let d = 16
  while (d * d < count) d *= 2
  return d
}

/** Seeded agent init with every agent inside the start cell (UV box
 *  [0,cellFracX]×[0,cellFracY]). Per texel: (x, y, heading, respawnPhase);
 *  heading in [0,2π); respawn phase staggered so agents respawn at different times. */
export function initAgentsAtStart(
  seed: number, count: number, cellFracX: number, cellFracY: number,
): Float32Array {
  const dim = texDimFor(count)
  const rng = mulberry32(seed)
  const n = dim * dim
  const out = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    out[i * 4 + 0] = rng() * cellFracX
    out[i * 4 + 1] = rng() * cellFracY
    out[i * 4 + 2] = rng() * Math.PI * 2
    // birthTime ORDERED by index (not random): the active agents are then the
    // contiguous block [0, u_time·N), so the frontier-spawn can sample only live
    // agents instead of mostly hitting unborn ones during slow emission.
    out[i * 4 + 3] = i / n
  }
  return out
}

/** Bake the gradient into a 256×RGBA byte LUT (uploaded as a 256×1 texture). */
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
