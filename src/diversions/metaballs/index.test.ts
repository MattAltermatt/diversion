import { describe, it, expect } from 'vitest'
import metaballs from './index'
import { metaballsSchema } from './schema'
import { makeGLContext } from '../../test-setup'

const size = { width: 800, height: 600 }

describe('metaballs update() reseed-in-place (#124)', () => {
  it('returns true on a seed change and reseeds the blob set WITHOUT rebuilding the shader', () => {
    const gl = makeGLContext()
    const cfg = metaballsSchema.parse({})
    const state = metaballs.setup(gl, cfg, size)
    const before = state.blobs.map((b) => ({ ...b }))

    const handled = metaballs.update!(state, { ...cfg, seed: cfg.seed + 1 }, size)

    expect(handled).toBe(true) // applied live → no teardown + initGL fallback
    // Only the single setup() build created a program — update did NOT rebuild it.
    expect(gl.calls.filter((c) => c === 'createProgram').length).toBe(1)
    // A different seed produces a different arrangement (reseeded in place).
    const drifted = state.blobs.some((b, i) => b.x0 !== before[i].x0)
    expect(drifted).toBe(true)
  })

  it('returns true and resizes the blob set on a blobCount change (no shader rebuild)', () => {
    const gl = makeGLContext()
    const cfg = metaballsSchema.parse({})
    const state = metaballs.setup(gl, cfg, size)

    const handled = metaballs.update!(state, { ...cfg, blobCount: cfg.blobCount + 3 }, size)

    expect(handled).toBe(true)
    expect(state.blobs.length).toBe(cfg.blobCount + 3)
    expect(gl.calls.filter((c) => c === 'createProgram').length).toBe(1)
  })

  it('still applies a radius-bound change live without a reseed', () => {
    const gl = makeGLContext()
    const cfg = metaballsSchema.parse({})
    const state = metaballs.setup(gl, cfg, size)
    const seededXs = state.blobs.map((b) => b.x0)

    const handled = metaballs.update!(state, { ...cfg, radiusMax: cfg.radiusMax + 0.05 }, size)

    expect(handled).toBe(true)
    // x0 positions are untouched (no reseed) — only radii re-derive.
    expect(state.blobs.map((b) => b.x0)).toEqual(seededXs)
  })
})
