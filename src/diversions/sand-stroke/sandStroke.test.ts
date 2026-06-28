import { describe, it, expect } from 'vitest'
import {
  parseHex8, grainAlpha, MAX_GAIN, stepGain, blendPixel, sampleGradientRGBA, gageFor,
  createSandState, stepSand, updateSandState, resizeSandState, BASE_CROSS_SECONDS,
} from './sandStroke'
import { sandStrokeSchema, type SandStrokeConfig } from './schema'

const cfg = (over: Partial<SandStrokeConfig> = {}) => sandStrokeSchema.parse({ ...over })

describe('parseHex8', () => {
  it('parses #rrggbbaa to rgb + 0..1 alpha', () => {
    expect(parseHex8('#80c0ffff')).toEqual({ r: 128, g: 192, b: 255, a: 1 })
    const c = parseHex8('#00000000')
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })
})

describe('grainAlpha', () => {
  it('is the spine opacity at i=0 and feathers toward ~0 at the edge', () => {
    expect(grainAlpha(0, 200, 0.1)).toBeCloseTo(0.1)
    const edge = grainAlpha(199, 200, 0.1)
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(0.005)
  })
  it('is monotonically decreasing in i', () => {
    let prev = Infinity
    for (let i = 0; i < 200; i++) {
      const a = grainAlpha(i, 200, 0.1)
      expect(a).toBeLessThanOrEqual(prev)
      prev = a
    }
  })
})

describe('stepGain', () => {
  it('clamps to ±MAX_GAIN', () => {
    expect(MAX_GAIN).toBeCloseTo(0.3)
    const up = () => 1 // rng()=1 -> +waviness every step
    let g = 0
    for (let i = 0; i < 100; i++) g = stepGain(g, 0.042, up)
    expect(g).toBeCloseTo(MAX_GAIN)
    const down = () => 0 // rng()=0 -> -waviness every step
    g = 0
    for (let i = 0; i < 100; i++) g = stepGain(g, 0.042, down)
    expect(g).toBeCloseTo(-MAX_GAIN)
  })
  it('is a uniform symmetric step of ±waviness', () => {
    expect(stepGain(0, 0.05, () => 0.5)).toBeCloseTo(0) // rng()=0.5 -> 0 delta
    expect(stepGain(0, 0.05, () => 1)).toBeCloseTo(0.05)
  })
})

describe('blendPixel (tpoint)', () => {
  it('moves each channel a fraction a toward the grain colour and sets opaque', () => {
    const w = 2, h = 1
    const buf = new Uint8ClampedArray(w * h * 4).fill(0)
    blendPixel(buf, w, h, 0, 0, { r: 100, g: 200, b: 50, a: 1 }, 0.5)
    expect(buf[0]).toBe(50)  // 0 + (100-0)*0.5
    expect(buf[1]).toBe(100) // 0 + (200-0)*0.5
    expect(buf[2]).toBe(25)  // 0 + (50-0)*0.5
    expect(buf[3]).toBe(255) // opaque
  })
  it('a=0 is a no-op on rgb; ignores out-of-bounds', () => {
    const buf = new Uint8ClampedArray(4).fill(10)
    buf[3] = 255
    blendPixel(buf, 1, 1, 0, 0, { r: 255, g: 255, b: 255, a: 1 }, 0)
    expect([buf[0], buf[1], buf[2]]).toEqual([10, 10, 10])
    expect(() => blendPixel(buf, 1, 1, 5, 5, { r: 0, g: 0, b: 0, a: 1 }, 1)).not.toThrow()
  })
})

describe('sampleGradientRGBA', () => {
  it('returns endpoints at t=0 and t=1', () => {
    const stops = ['#000000ff', '#ffffffff']
    expect(sampleGradientRGBA(stops, 0)).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(sampleGradientRGBA(stops, 1)).toMatchObject({ r: 255, g: 255, b: 255 })
    expect(sampleGradientRGBA(stops, 0.5).r).toBeCloseTo(128, -1)
  })
})

describe('gageFor', () => {
  it('scales so gage·sin(MAX_GAIN) equals bandHeight·h', () => {
    const h = 800, bandHeight = 0.13
    expect(gageFor(bandHeight, h) * Math.sin(MAX_GAIN)).toBeCloseTo(bandHeight * h)
  })
})

describe('createSandState', () => {
  it('creates one sweep per stroke; all enter from the left (jittered start) with stratified lanes', () => {
    const s = createSandState(cfg({ strokes: 12 }), 300, 200)
    expect(s.sweeps).toHaveLength(12)
    for (const sw of s.sweeps) {
      // jittered start time = a negative phase; each still enters from the left edge (x crosses 0)
      expect(sw.x).toBeLessThanOrEqual(0)
      expect(sw.x).toBeGreaterThan(-300)
      expect(sw.y).toBeGreaterThanOrEqual(0)
      expect(sw.y).toBeLessThan(200)
    }
    // jittered: not all launching at the same instant
    expect(new Set(s.sweeps.map((sw) => sw.x)).size).toBeGreaterThan(1)
    const ys = s.sweeps.map((sw) => sw.y)
    // stratified: distinct lanes spanning the height (no top-clustering), one per band
    expect(new Set(ys).size).toBe(12)
    expect(Math.min(...ys)).toBeLessThan(200 / 4) // a lane in the top quarter
    expect(Math.max(...ys)).toBeGreaterThan((200 * 3) / 4) // and one in the bottom quarter
    expect(s.buf.length).toBe(300 * 200 * 4)
  })

  it('stratifies lanes for ANY seed (no top-clustering — the seed-4823 bug)', () => {
    for (const seed of [4823, 1, 2, 7, 100, 999]) {
      const s = createSandState(cfg({ seed, strokes: 4 }), 300, 800)
      const ys = s.sweeps.map((sw) => sw.y).sort((a, b) => a - b)
      // one lane per quarter-band → guaranteed spread regardless of seed
      expect(ys[0]).toBeLessThan(200)
      expect(ys[3]).toBeGreaterThan(600)
    }
  })

  it('fills the buffer with the background colour (opaque)', () => {
    const s = createSandState(cfg({ background: '#ffffff' }), 4, 4)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
  })
})

describe('stepSand determinism', () => {
  it('same seed → identical buffer after N steps; different seed differs', () => {
    // speed 4 + enough steps so every sweep fully crosses (past its jittered negative start)
    const a = createSandState(cfg({ seed: 7, speed: 4 }), 120, 80)
    const b = createSandState(cfg({ seed: 7, speed: 4 }), 120, 80)
    for (let i = 0; i < 300; i++) { stepSand(a, 16); stepSand(b, 16) }
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf))

    const c = createSandState(cfg({ seed: 8, speed: 4 }), 120, 80)
    for (let i = 0; i < 300; i++) stepSand(c, 16)
    expect(Array.from(c.buf)).not.toEqual(Array.from(a.buf))
  })

  it('is deterministic for a given frame cadence (the share-link guarantee)', () => {
    // Same seed + same dt sequence → pixel-identical, even with a varying-but-repeated cadence.
    // (Per-sweep RNG means one sweep's frame timing can't perturb another's; a shared interleaved
    // stream would.) Exact reproduction across DIFFERENT frame rates isn't promised — the gain is a
    // cumulative walk consumed one draw per column, so a float-boundary column drift would desync it.
    const dts = [16, 17, 16, 15, 17, 16, 16, 18, 15, 16]
    const a = createSandState(cfg({ seed: 5, speed: 4 }), 160, 100)
    const b = createSandState(cfg({ seed: 5, speed: 4 }), 160, 100)
    for (let r = 0; r < 30; r++) for (const dt of dts) { stepSand(a, dt); stepSand(b, dt) }
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf))
  })

  it('gives each sweep an independent RNG stream', () => {
    const s = createSandState(cfg({ seed: 9, strokes: 4 }), 100, 100)
    const r0 = Array.from({ length: 5 }, () => s.sweeps[0].rng())
    const r1 = Array.from({ length: 5 }, () => s.sweeps[1].rng())
    expect(r0).not.toEqual(r1)
  })

  it('advances sweeps rightward and paints (buffer changes from background)', () => {
    const s = createSandState(cfg({ seed: 1, strokes: 6, speed: 4 }), 200, 120)
    const before = Array.from(s.buf)
    for (let i = 0; i < 300; i++) stepSand(s, 16) // enough to clear every jittered start
    expect(s.sweeps.some((sw) => sw.x > 0)).toBe(true)
    expect(Array.from(s.buf)).not.toEqual(before)
  })
})

describe('sweep respawn', () => {
  it('wraps x to the left and re-jitters y within the sweep’s band each pass', () => {
    const h = 400, strokes = 4
    const s = createSandState(cfg({ seed: 2, strokes, speed: 4 }), 60, h)
    const sw = s.sweeps[0] // band 0 → y always in [0, h/strokes)
    const yValues = new Set<number>()
    for (let i = 0; i < 800; i++) {
      stepSand(s, 16)
      yValues.add(sw.y)
      expect(sw.y).toBeGreaterThanOrEqual(0)
      expect(sw.y).toBeLessThan(h / strokes) // stays in its band → never clusters
    }
    expect(sw.x).toBeLessThan(60)
    expect(sw.x).toBeGreaterThanOrEqual(0)
    expect(yValues.size).toBeGreaterThan(1) // y changes across respawns (a new position each pass)
  })
})

describe('updateSandState', () => {
  it('applies live params (returns true) and recomputes gage on bandHeight', () => {
    const s = createSandState(cfg({ bandHeight: 0.13 }), 100, 200)
    const g0 = s.gage
    expect(updateSandState(s, cfg({ bandHeight: 0.26 }), { width: 100, height: 200 })).toBe(true)
    expect(s.gage).toBeCloseTo(g0 * 2)
    expect(updateSandState(s, cfg({ opacity: 0.2 }), { width: 100, height: 200 })).toBe(true)
    expect(s.cfg.opacity).toBeCloseTo(0.2)
  })

  it('returns false for structural changes (strokes, seed, background)', () => {
    const s = createSandState(cfg({ strokes: 10, seed: 1, background: '#ffffff' }), 100, 100)
    expect(updateSandState(s, cfg({ strokes: 11 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSandState(s, cfg({ seed: 2 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSandState(s, cfg({ background: '#000000' }), { width: 100, height: 100 })).toBe(false)
  })
})

describe('resizeSandState', () => {
  it('rebuilds the buffer at the new size and refills background', () => {
    const s = createSandState(cfg({ background: '#ffffff' }), 50, 50)
    resizeSandState(s, { width: 80, height: 60 })
    expect(s.w).toBe(80)
    expect(s.h).toBe(60)
    expect(s.buf.length).toBe(80 * 60 * 4)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
  })
})

describe('BASE_CROSS_SECONDS', () => {
  it('is a positive constant', () => { expect(BASE_CROSS_SECONDS).toBeGreaterThan(0) })
})
