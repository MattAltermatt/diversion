/**
 * terrain.ts — endless, deterministic terrain as a noise height-field.
 *
 * `makeTerrain(seed, roughness)` returns a PURE height function y = f(x) (meters),
 * so the track is infinite and reproducible: any world-x has a defined height with
 * no stored array. The diversion samples a sliding window of this function into
 * physics segments around the car (built/rebuilt as it advances), and the renderer
 * samples it across the viewport.
 */
import { makeNoise3D } from '../../framework/rng'
import type { Vec2 } from './physics'

export const TERRAIN_TYPES = ['rolling', 'dunes', 'plateaus', 'ridges'] as const
export type TerrainType = (typeof TERRAIN_TYPES)[number]

/** Deterministic endless terrain height (meters) as a function of world-x.
 *  `type` selects the hill shape; 'rolling' is byte-identical to the legacy
 *  formula (keeps existing determinism values). All types share the flat launch
 *  ramp and scale amplitude by `roughness`. */
export function makeTerrain(
  seed: number,
  roughness: number,
  type: TerrainType = 'rolling',
): (x: number) => number {
  const noise = makeNoise3D(seed)
  const n = (x: number, f: number) => noise(x * f, 0, 0) // value noise in [-1,1]
  return (x: number) => {
    // flat launch ramp for the first ~9 m so every car starts on level ground
    const ramp = Math.min(1, Math.max(0, (x - 1) / 8))
    let h: number
    switch (type) {
      case 'dunes': {
        const s = n(x, 0.025) * 3.5 + n(x, 0.06) * 1.2
        h = s > 0 ? Math.pow(s / 4.7, 0.8) * 4.7 : s // sharpen crests
        break
      }
      case 'plateaus': {
        const step = 1.4
        h = Math.round((n(x, 0.04) * 3.2) / step) * step + n(x, 0.5) * 0.18 // tables + cliff edges + tiny jitter
        break
      }
      case 'ridges': {
        h = (1 - Math.abs(n(x, 0.05))) * 3.4 + (1 - Math.abs(n(x, 0.13))) * 1.4 - 2.2 // sharp peaks & V-valleys, centered
        break
      }
      case 'rolling':
      default:
        // octaves of value noise → rolling hills + steeper bumps that eventually
        // stop a car (so generations advance); amplitude scales with roughness
        h = n(x, 0.05) * 2.6 + n(x, 0.14) * 1.6 + n(x, 0.34) * 0.8
    }
    return ramp * h * roughness * 2.0
  }
}

/** Sample a height function into a polyline over [startX, endX] at `segLen` spacing. */
export function terrainPoints(
  height: (x: number) => number,
  startX: number,
  endX: number,
  segLen: number,
): Vec2[] {
  const pts: Vec2[] = []
  for (let x = startX; x <= endX + segLen * 0.5; x += segLen) pts.push({ x, y: height(x) })
  return pts
}
