/**
 * ghost.ts — the record-holder replay (#227).
 *
 * A "ghost" is a translucent replay of the record-holding car, running alongside the
 * current one (the visual sibling of the numeric splits, #221). It's captured by
 * recording the record car's pose every physics step; on replay we index that track
 * by the live car's step count so the two race in lockstep. Both cars spawn at the
 * same point on the same track, so the recorded world positions replay directly —
 * if the record was faster, the ghost pulls ahead on screen.
 *
 * Transient by design: the track is rebuilt whenever a car beats the record, and it
 * holds no physics handles (just numbers), so nothing here needs teardown or persist.
 * The pure decode (`ghostPoseAt`) is unit-tested; the physics-touching capture lives
 * in car.ts (`capturePose`).
 */
import type { CarBodies } from './car'

/** A recorded record-holder run: the car's static shape (members + wheel radii, which
 *  don't change across the run) plus a flat per-step pose track. Each frame is
 *  `[nx,ny]×nodeCount` followed by `[wx,wy,angle]×wheelCount`, matching capturePose. */
export interface GhostTrack {
  members: { a: number; b: number; stiffness: number }[]
  wheelRadii: number[]
  nodeCount: number
  wheelCount: number
  /** frames[step] = flat pose after that physics step. */
  frames: number[][]
}

export interface GhostPose {
  nodes: { x: number; y: number }[]
  wheels: { x: number; y: number; angle: number }[]
}

/** Build a ghost track from the finished record car's shape + its recorded frames.
 *  `frames` is taken by reference — the caller must hand over a fresh array afterward
 *  (spawnCar allocates a new recording buffer) so the promoted track isn't mutated. */
export function makeGhostTrack(car: CarBodies, frames: number[][]): GhostTrack {
  return {
    members: car.members.map((m) => ({ a: m.a, b: m.b, stiffness: m.stiffness })),
    wheelRadii: car.wheels.map((w) => w.radius),
    nodeCount: car.nodes.length,
    wheelCount: car.wheels.length,
    frames,
  }
}

/** Decode the ghost pose at replay `step`, clamped to the last recorded frame — the
 *  ghost freezes at the record's finish once the live car outlasts it. Returns null
 *  for an empty track (nothing to draw yet). Pure. */
export function ghostPoseAt(track: GhostTrack, step: number): GhostPose | null {
  const n = track.frames.length
  if (n === 0) return null
  const f = track.frames[Math.max(0, Math.min(step, n - 1))]
  const nodes: GhostPose['nodes'] = []
  for (let i = 0; i < track.nodeCount; i++) nodes.push({ x: f[i * 2], y: f[i * 2 + 1] })
  const base = track.nodeCount * 2
  const wheels: GhostPose['wheels'] = []
  for (let i = 0; i < track.wheelCount; i++) {
    const o = base + i * 3
    wheels.push({ x: f[o], y: f[o + 1], angle: f[o + 2] })
  }
  return { nodes, wheels }
}
