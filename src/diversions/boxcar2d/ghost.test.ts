import { describe, it, expect } from 'vitest'
import { makeGhostTrack, ghostPoseAt, type GhostTrack } from './ghost'
import type { CarBodies } from './car'

/** A minimal CarBodies stand-in — makeGhostTrack only reads plain data (members,
 *  node count, wheel radii), never the BodyId handles. */
function fakeCar(): CarBodies {
  return {
    nodes: [{ body: 0 as never, slot: 0 }, { body: 0 as never, slot: 1 }],
    members: [{ a: 0, b: 1, stiffness: 0.8 }],
    wheels: [{ body: 0 as never, radius: 0.4 }],
  }
}

describe('makeGhostTrack', () => {
  it('captures the static shape + frames by reference', () => {
    const frames = [[0, 0, 1, 0, 0, 0, 0]]
    const t = makeGhostTrack(fakeCar(), frames)
    expect(t.nodeCount).toBe(2)
    expect(t.wheelCount).toBe(1)
    expect(t.wheelRadii).toEqual([0.4])
    expect(t.members).toEqual([{ a: 0, b: 1, stiffness: 0.8 }])
    expect(t.frames).toBe(frames)
  })
})

describe('ghostPoseAt', () => {
  // 3 frames; layout = [n0x,n0y, n1x,n1y, w0x,w0y,w0a]
  const track: GhostTrack = {
    members: [{ a: 0, b: 1, stiffness: 0.8 }],
    wheelRadii: [0.4],
    nodeCount: 2,
    wheelCount: 1,
    frames: [
      [0, 0, 1, 0, 0.5, 0, 0],
      [1, 0, 2, 0, 1.5, 0, 1],
      [2, 1, 3, 1, 2.5, 1, 2],
    ],
  }

  it('decodes node + wheel poses at a step', () => {
    const p = ghostPoseAt(track, 1)!
    expect(p.nodes).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }])
    expect(p.wheels).toEqual([{ x: 1.5, y: 0, angle: 1 }])
  })

  it('clamps past the last frame (ghost freezes at the record finish)', () => {
    const p = ghostPoseAt(track, 99)!
    expect(p.nodes[0]).toEqual({ x: 2, y: 1 })
    expect(p.wheels[0]).toEqual({ x: 2.5, y: 1, angle: 2 })
  })

  it('clamps a negative step to the first frame', () => {
    const p = ghostPoseAt(track, -5)!
    expect(p.nodes[0]).toEqual({ x: 0, y: 0 })
  })

  it('returns null for an empty track', () => {
    expect(ghostPoseAt({ ...track, frames: [] }, 0)).toBeNull()
  })
})
