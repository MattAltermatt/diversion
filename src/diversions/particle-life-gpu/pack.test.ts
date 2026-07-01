import { describe, it, expect } from 'vitest'
import {
  seedWorld, packMatrix, packColors, packParams, packView, worldDims, DEFAULT_CAMERA,
  resolveMatrix, WORLD_W, WORLD_H, DT, PARAMS_SIZE, VIEW_SIZE,
} from './pack'
import { createSim } from '../particle-life/sim'
import { buildMatrix } from '../particle-life/matrix'

describe('particle-life-gpu pack', () => {
  describe('seedWorld', () => {
    it('is deterministic for a given seed', () => {
      const a = seedWorld(500, 6, 42)
      const b = seedWorld(500, 6, 42)
      expect(a.pos).toEqual(b.pos)
      expect(a.types).toEqual(b.types)
    })

    it('produces a different world for a different seed', () => {
      const a = seedWorld(500, 6, 42)
      const b = seedWorld(500, 6, 43)
      expect(a.pos).not.toEqual(b.pos)
    })

    it('seeds positions in-bounds, velocities zero, species in [0,colors)', () => {
      const { pos, vel, types } = seedWorld(1000, 5, 7)
      expect(pos.length).toBe(2000)
      expect(vel.length).toBe(2000)
      expect(types.length).toBe(1000)
      for (let i = 0; i < 1000; i++) {
        expect(pos[i * 2]).toBeGreaterThanOrEqual(0)
        expect(pos[i * 2]).toBeLessThan(WORLD_W)
        expect(pos[i * 2 + 1]).toBeGreaterThanOrEqual(0)
        expect(pos[i * 2 + 1]).toBeLessThan(WORLD_H)
        expect(types[i]).toBeGreaterThanOrEqual(0)
        expect(types[i]).toBeLessThan(5)
      }
      expect(vel.every((v) => v === 0)).toBe(true)
    })

    // The determinism keystone: the GPU world's GENESIS must be byte-identical to
    // the CPU diversion's for the same seed, so `?seed=N` starts the same world on
    // every machine (only the per-step GPU evolution is allowed to diverge).
    it('matches the CPU sim genesis exactly (same seed → same starting world)', () => {
      const seed = 1337, count = 800, colors = 6
      const gpu = seedWorld(count, colors, seed)
      const cpu = createSim({
        count, colors, seed, rMax: 80, beta: 0.3, forceScale: 1, friction: 0.04,
        symmetry: 'Asymmetric', attractBias: 0.1,
      })
      for (let i = 0; i < count; i++) {
        expect(gpu.pos[i * 2]).toBe(cpu.px[i])
        expect(gpu.pos[i * 2 + 1]).toBe(cpu.py[i])
        expect(gpu.types[i]).toBe(cpu.type[i])
      }
    })
  })

  describe('packMatrix', () => {
    it('equals the shared buildMatrix (identical rules to the CPU diversion)', () => {
      const a = packMatrix(6, 99, 'Asymmetric', 0.2)
      const b = buildMatrix(6, 99, 'Asymmetric', 0.2)
      expect(a).toEqual(b)
      expect(a.length).toBe(36)
    })
  })

  describe('resolveMatrix', () => {
    const base = { colors: 3, seed: 1337, symmetry: 'Asymmetric' as const, attractBias: 0.1 }

    it('falls back to the seed-derived matrix when no override', () => {
      const got = resolveMatrix({ ...base })
      const want = packMatrix(3, 1337, 'Asymmetric', 0.1)
      expect(Array.from(got)).toEqual(Array.from(want))
    })

    it('prefers a valid override of length colors²', () => {
      const override = [0.5, -0.5, 1, -1, 0, 0.25, -0.25, 0.75, -0.75] // 3×3
      const got = resolveMatrix({ ...base, matrix: override })
      expect(Array.from(got)).toEqual(override)
    })

    it('ignores an override of the wrong length (falls back to seed)', () => {
      const got = resolveMatrix({ ...base, matrix: [0.5, -0.5] }) // wrong length for 3×3
      const want = packMatrix(3, 1337, 'Asymmetric', 0.1)
      expect(Array.from(got)).toEqual(Array.from(want))
    })
  })

  describe('packColors', () => {
    it('lays out RGBA in [0,1] with opaque alpha, one vec4 per species', () => {
      const c = packColors('Spectrum', 6)
      expect(c.length).toBe(24)
      for (let i = 0; i < 6; i++) {
        expect(c[i * 4 + 3]).toBe(1) // alpha
        for (let k = 0; k < 3; k++) {
          expect(c[i * 4 + k]).toBeGreaterThanOrEqual(0)
          expect(c[i * 4 + k]).toBeLessThanOrEqual(1)
        }
      }
    })
  })

  describe('packParams', () => {
    it('writes the compute uniform layout (count, colors, derived force/friction)', () => {
      const cfg = { count: 8000, colors: 6, rMax: 80, beta: 0.3, forceScale: 1.5, friction: 0.04 }
      const dv = new DataView(packParams(cfg))
      expect(PARAMS_SIZE).toBe(48)
      expect(dv.getUint32(0, true)).toBe(8000) // count
      expect(dv.getUint32(4, true)).toBe(6) // colors
      expect(dv.getFloat32(8, true)).toBeCloseTo(80) // rMax
      expect(dv.getFloat32(12, true)).toBeCloseTo(0.3) // beta
      expect(dv.getFloat32(16, true)).toBeCloseTo(80 * 1.5) // forceMul = rMax*forceScale
      expect(dv.getFloat32(20, true)).toBeCloseTo(Math.pow(0.5, DT / 0.04)) // frictionFactor
      expect(dv.getFloat32(24, true)).toBeCloseTo(DT)
      expect(dv.getFloat32(28, true)).toBeCloseTo(WORLD_W)
      expect(dv.getFloat32(32, true)).toBeCloseTo(WORLD_H)
    })
  })

  describe('worldDims', () => {
    it('scales the base arena by the world-size multiplier', () => {
      expect(worldDims(1)).toEqual({ w: WORLD_W, h: WORLD_H })
      expect(worldDims(4)).toEqual({ w: WORLD_W * 4, h: WORLD_H * 4 })
    })
  })

  describe('packView', () => {
    it('cover-fits the whole world at the default camera, carrying arena + view centre', () => {
      const dv = new DataView(packView({ dotSize: 2.5 }, { width: 1920, height: 1080 }, 2, DEFAULT_CAMERA))
      expect(VIEW_SIZE).toBe(48)
      const s0 = Math.max(1920 / WORLD_W, 1080 / WORLD_H)
      expect(dv.getFloat32(0, true)).toBeCloseTo(s0) // scale (zoom 1)
      expect(dv.getFloat32(4, true)).toBeCloseTo(WORLD_W / 2) // viewCx (pan 0 → world centre)
      expect(dv.getFloat32(8, true)).toBeCloseTo(WORLD_H / 2) // viewCy
      expect(dv.getFloat32(12, true)).toBeCloseTo(WORLD_W) // worldW
      expect(dv.getFloat32(16, true)).toBeCloseTo(WORLD_H) // worldH
      expect(dv.getFloat32(20, true)).toBeCloseTo(1920) // viewW
      expect(dv.getFloat32(24, true)).toBeCloseTo(1080) // viewH
    })

    it('zoom multiplies scale; pan shifts the view centre', () => {
      const dv = new DataView(packView({ dotSize: 2.5 }, { width: 1920, height: 1080 }, 2, { zoom: 2, panX: 100, panY: -50 }))
      const s0 = Math.max(1920 / WORLD_W, 1080 / WORLD_H)
      expect(dv.getFloat32(0, true)).toBeCloseTo(s0 * 2) // scale = s0 * zoom
      expect(dv.getFloat32(4, true)).toBeCloseTo(WORLD_W / 2 + 100) // viewCx + panX
      expect(dv.getFloat32(8, true)).toBeCloseTo(WORLD_H / 2 - 50) // viewCy + panY
    })

    it('a bigger world lowers the cover-fit scale (shows more arena)', () => {
      const { w, h } = worldDims(4)
      const dv = new DataView(packView({ dotSize: 2.5 }, { width: 1920, height: 1080 }, 2, DEFAULT_CAMERA, w, h))
      expect(dv.getFloat32(0, true)).toBeCloseTo(Math.max(1920 / w, 1080 / h))
      expect(dv.getFloat32(12, true)).toBeCloseTo(w) // worldW = 4× base
    })
  })
})
