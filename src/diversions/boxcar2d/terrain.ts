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

/** Deterministic endless terrain height (meters) as a function of world-x. */
export function makeTerrain(seed: number, roughness: number): (x: number) => number {
  const noise = makeNoise3D(seed)
  return (x: number) => {
    // flat launch ramp for the first ~9 m so every car starts on level ground
    const ramp = Math.min(1, Math.max(0, (x - 1) / 8))
    // octaves of value noise → rolling hills + steeper bumps that eventually
    // stop a car (so generations advance); amplitude scales with roughness
    const h =
      noise(x * 0.05, 0, 0) * 2.6 +
      noise(x * 0.14, 0, 0) * 1.6 +
      noise(x * 0.34, 0, 0) * 0.8
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
