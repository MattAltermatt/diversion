import { describe, it, expect } from 'vitest'
import { starfieldSchema } from './schema'
import {
  createStarfieldState, stepFrame, respawn, speedZ,
  ZFAR, ZNEAR, type StarfieldState,
} from './starfield'

const W = 800, H = 600
const cx = W / 2, cy = H / 2
const radius = (s: { sx: number; sy: number }) => Math.hypot(s.sx - cx, s.sy - cy)

function makeState(overrides = {}): StarfieldState {
  const cfg = starfieldSchema.parse({ seed: 12345, starCount: 400, ...overrides })
  return createStarfieldState(cfg, W, H)
}

describe('schema', () => {
  it('parses with valid defaults', () => {
    const cfg = starfieldSchema.parse({})
    expect(cfg.starCount).toBeGreaterThanOrEqual(100)
    expect(cfg.warpSpeed).toBeGreaterThanOrEqual(0)
    expect(cfg.warpSpeed).toBeLessThanOrEqual(1)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(['white', 'blue-white', 'spectrum']).toContain(cfg.starColorMode)
  })

  it('slider fields carry min/max bounds (UX invariant #4)', () => {
    const shape = starfieldSchema.shape
    for (const [key, field] of Object.entries(shape)) {
      const meta = (field as { meta?: () => Record<string, unknown> }).meta?.()
      if (meta?.ui === 'slider') {
        expect(typeof meta.min, `${key} min`).toBe('number')
        expect(typeof meta.max, `${key} max`).toBe('number')
      }
    }
  })
})

describe('determinism', () => {
  it('same seed → identical star positions after N frames', () => {
    const a = makeState({ seed: 999 })
    const b = makeState({ seed: 999 })
    for (let i = 0; i < 120; i++) { stepFrame(a, 16); stepFrame(b, 16) }
    expect(a.stars.map((s) => [s.x, s.y, s.z, s.sx, s.sy]))
      .toEqual(b.stars.map((s) => [s.x, s.y, s.z, s.sx, s.sy]))
  })

  it('different seed → different star field', () => {
    const a = makeState({ seed: 1 })
    const b = makeState({ seed: 2 })
    const same = a.stars.every((s, i) => s.x === b.stars[i].x && s.y === b.stars[i].y)
    expect(same).toBe(false)
  })
})

describe('speedZ mapping', () => {
  it('is monotonic and stays positive across warpSpeed', () => {
    expect(speedZ(0)).toBeGreaterThan(0)
    expect(speedZ(1)).toBeGreaterThan(speedZ(0.5))
    expect(speedZ(0.5)).toBeGreaterThan(speedZ(0))
  })
})

describe('headline: stars sweep outward, respawn past the camera', () => {
  it('a star projects FARTHER from centre as its z shrinks', () => {
    const state = makeState({ warpSpeed: 0.5, roll: 0, glow: false })
    // pick a star with meaningful off-centre offset that will not respawn soon
    const s = state.stars.find((st) => st.z > 0.6 && Math.hypot(st.x, st.y) > 0.4)!
    expect(s).toBeTruthy()
    const z0 = s.z, r0 = radius(s)
    stepFrame(state, 200)
    // still the same star (didn't cross the camera)
    expect(s.z).toBeLessThan(z0)
    expect(s.z).toBeGreaterThan(ZNEAR)
    expect(radius(s)).toBeGreaterThan(r0) // swept outward
    expect(s.bright).toBeGreaterThan(0)   // brightened toward the viewer
  })

  it('respawns far away once it passes the camera', () => {
    const state = makeState()
    const s = state.stars[0]
    s.z = ZNEAR + 0.001 // right at the camera
    stepFrame(state, 100) // any forward motion pushes it past
    expect(s.z).toBeCloseTo(ZFAR, 5) // reset to the far plane
  })

  it('respawn resets to the far plane within the field box', () => {
    const state = makeState({ spread: 1.4 })
    const s = state.stars[0]
    respawn(s, state.rng, state.cfg)
    expect(s.z).toBe(ZFAR)
    expect(Math.abs(s.x)).toBeLessThanOrEqual(1.4)
    expect(Math.abs(s.y)).toBeLessThanOrEqual(1.4)
  })

  it('all star fields stay finite over a long warp run', () => {
    const state = makeState({ warpSpeed: 1, roll: 0.5, starCount: 300 })
    let allFinite = true
    let inRange = true
    for (let i = 0; i < 600; i++) {
      stepFrame(state, 16)
      for (const s of state.stars) {
        if (!Number.isFinite(s.sx) || !Number.isFinite(s.sy) || !Number.isFinite(s.z)) allFinite = false
        if (s.z <= ZNEAR - 1e-6 || s.z > ZFAR + 1e-6) inRange = false
      }
    }
    expect(allFinite).toBe(true)
    expect(inRange).toBe(true)
  })
})
