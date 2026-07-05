import { sampleCyclic } from '../../framework/gradient'

// Injection = the screensaver's heartbeat. With no user input the field would
// advect and fade to black; instead we periodically spill a colored dye blob
// plus a directional velocity impulse at a random spot, so the flow is
// perpetually re-energized. All the *randomness* lives here as a pure function
// of a seeded RNG so it's headlessly testable; gl.ts owns the GPU splat.

/** One injection event, in resolution-independent terms. `nx,ny` are 0..1 across
 *  the field, `angle` is the impulse direction, `r,g,b` are the dye color 0..1. */
export interface Blob {
  nx: number
  ny: number
  angle: number
  r: number
  g: number
  b: number
}

/** Draw the next blob from a seeded RNG stream. Deterministic: the same rng
 *  sequence + palette yields the same blobs, so a given seed is reproducible.
 *  Keeps blobs off the very edges (0.1..0.9) so impulses drive into the field. */
export function nextBlob(rng: () => number, stops: string[]): Blob {
  const nx = 0.1 + rng() * 0.8
  const ny = 0.1 + rng() * 0.8
  const angle = rng() * Math.PI * 2
  const c = sampleCyclic(stops, rng()) // RGBA, channels 0..255
  return { nx, ny, angle, r: c.r / 255, g: c.g / 255, b: c.b / 255 }
}
