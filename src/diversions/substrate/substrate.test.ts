import { describe, it, expect } from 'vitest'
import {
  parseHex8, parseHex6, blendPixel, sampleGradientRGBA, grainAlpha,
  quantizeAngle, angleDiff, mulberry32, seedFor, SAND_MAXG, STEP,
  makeGrid, markCell, blocks, EMPTY,
  createSubstrateState, advanceCrack,
  findStart, makeCrack,
  rayLength, regionFill, rollCurvature,
  stepSubstrate,
  updateSubstrateState, resizeSubstrateState,
} from './substrate'
import { substrateSchema, type SubstrateConfig } from './schema'

const cfg = (over: Partial<SubstrateConfig> = {}) => substrateSchema.parse({ ...over })

describe('parseHex8 / parseHex6', () => {
  it('parses 8-digit to rgb + 0..1 alpha and 6-digit to opaque', () => {
    expect(parseHex8('#80c0ff80')).toMatchObject({ r: 128, g: 192, b: 255 })
    expect(parseHex8('#80c0ff80').a).toBeCloseTo(128 / 255)
    expect(parseHex6('#2a2a2a')).toEqual({ r: 42, g: 42, b: 42, a: 1 })
  })
})

describe('blendPixel', () => {
  it('moves each channel a fraction a toward the colour and sets opaque; ignores OOB', () => {
    const buf = new Uint8ClampedArray(2 * 1 * 4).fill(0)
    blendPixel(buf, 2, 1, 0, 0, { r: 100, g: 200, b: 50, a: 1 }, 0.5)
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([50, 100, 25, 255])
    expect(() => blendPixel(buf, 2, 1, 9, 9, { r: 0, g: 0, b: 0, a: 1 }, 1)).not.toThrow()
  })
})

describe('sampleGradientRGBA', () => {
  it('returns endpoints and a mid value', () => {
    const stops = ['#000000ff', '#ffffffff']
    expect(sampleGradientRGBA(stops, 0)).toMatchObject({ r: 0 })
    expect(sampleGradientRGBA(stops, 1)).toMatchObject({ r: 255 })
    expect(sampleGradientRGBA(stops, 0.5).r).toBeCloseTo(128, -1)
  })
})

describe('grainAlpha', () => {
  it('is opacity at i=0 and monotonically decreasing to ~0', () => {
    expect(grainAlpha(0, 64, 0.1)).toBeCloseTo(0.1)
    let prev = Infinity
    for (let i = 0; i < 64; i++) {
      const a = grainAlpha(i, 64, 0.1)
      expect(a).toBeLessThanOrEqual(prev); prev = a
    }
    expect(grainAlpha(63, 64, 0.1)).toBeGreaterThan(0)
    expect(grainAlpha(63, 64, 0.1)).toBeLessThan(0.01)
  })
})

describe('quantizeAngle / angleDiff', () => {
  it('wraps angles into 0..359 and measures shortest difference', () => {
    expect(quantizeAngle(0)).toBe(0)
    expect(quantizeAngle(Math.PI)).toBe(180)
    expect(quantizeAngle(-Math.PI / 2)).toBe(270)
    expect(angleDiff(10, 350)).toBe(20)   // wraps
    expect(angleDiff(0, 90)).toBe(90)
    expect(angleDiff(0, 180)).toBe(180)
  })
})

describe('mulberry32 / seedFor', () => {
  it('gives distinct streams per index, repeatable per seed', () => {
    const a = mulberry32(seedFor(7, 0))
    const b = mulberry32(seedFor(7, 1))
    const a2 = mulberry32(seedFor(7, 0))
    expect(a()).not.toBe(b())
    expect(mulberry32(seedFor(7, 0))()).toBe(a2())
  })
  it('exposes the sand gain clamp constant', () => {
    expect(SAND_MAXG).toBeCloseTo(0.22)
  })
})

describe('occupancy grid', () => {
  it('makeGrid is all-EMPTY of the right length', () => {
    const g = makeGrid(4, 3)
    expect(g.length).toBe(12)
    expect(Array.from(g).every((v) => v === EMPTY)).toBe(true)
  })

  it('markCell writes the angle and reports first-mark only', () => {
    const g = makeGrid(2, 2)
    expect(markCell(g, 0, 90)).toBe(true)   // newly marked
    expect(g[0]).toBe(90)
    expect(markCell(g, 0, 95)).toBe(false)  // already marked
  })

  it('blocks: empty or near-parallel continues; clearly-different stops', () => {
    expect(blocks(EMPTY, 90)).toBe(false)   // empty → continue
    expect(blocks(90, 92)).toBe(false)      // within ANGLE_TOL → own line
    expect(blocks(0, 90)).toBe(true)        // perpendicular → stop
    expect(blocks(10, 350)).toBe(true)      // diff 20 > tol → stop
  })
})

describe('createSubstrateState', () => {
  it('fills background, seeds initialCracks, starts growing', () => {
    const s = createSubstrateState(cfg({ initialCracks: 4, background: '#ffffff' }), 100, 80)
    expect(s.cracks).toHaveLength(4)
    expect(s.phase).toBe('growing')
    expect(s.buf.length).toBe(100 * 80 * 4)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
    for (const c of s.cracks) {
      expect(c.alive).toBe(true)
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(100)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThan(80)
    }
  })

  it('gives each crack an independent RNG stream', () => {
    const s = createSubstrateState(cfg({ seed: 9, initialCracks: 3 }), 100, 100)
    const r0 = Array.from({ length: 4 }, () => s.cracks[0].rng())
    const r1 = Array.from({ length: 4 }, () => s.cracks[1].rng())
    expect(r0).not.toEqual(r1)
  })
})

describe('advanceCrack', () => {
  it('moves the head along its heading and inks a cell', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, crackColor: '#000000' }), 60, 60)
    const c = s.cracks[0]
    c.x = 30; c.y = 30; c.angle = 0 // heading +x
    const x0 = c.x
    advanceCrack(s, c)
    expect(c.x).toBeGreaterThan(x0)
    expect(c.alive).toBe(true)
    // grid got marked somewhere near (31,30)
    expect(Array.from(s.grid).some((v) => v !== -1)).toBe(true)
  })

  it('dies when it walks off the edge', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 40, 40)
    const c = s.cracks[0]
    c.x = 39.92; c.y = 20; c.angle = 0
    advanceCrack(s, c)
    expect(c.alive).toBe(false)
  })

  it('dies when it meets a clearly-different crack', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 40, 40)
    // pre-ink a vertical wall (angle 90°) at x=21 across the row the crack enters
    const deg = 90
    for (let y = 0; y < 40; y++) s.grid[y * 40 + 21] = deg
    const c = s.cracks[0]
    c.x = 20.92; c.y = 20; c.angle = 0 // heading +x into the wall
    advanceCrack(s, c)
    expect(c.alive).toBe(false)
  })
})

describe('findStart', () => {
  it('relocates onto an inked cell with a perpendicular-ish heading and revives', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, branchJitter: 0 }), 50, 50)
    // ink a horizontal crack (angle 0°) along row 25 — and record it in `marked`
    for (let x = 5; x < 45; x++) { const idx = 25 * 50 + x; s.grid[idx] = 0; s.marked.push(idx) }
    const c = s.cracks[0]
    c.alive = false
    findStart(s, c)
    expect(c.alive).toBe(true)
    // landed on the inked row
    expect(Math.floor(c.y)).toBe(25)
    expect(c.x).toBeGreaterThanOrEqual(5); expect(c.x).toBeLessThan(45)
    // heading ~perpendicular to 0° → cos(angle) ≈ 0 (±90°)
    expect(Math.abs(Math.cos(c.angle))).toBeLessThan(0.2)
  })

  it('always spawns on an inked cell when any exist — never from empty space', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, branchJitter: 0 }), 60, 60)
    const inked = [25 * 60 + 10, 12 * 60 + 30, 40 * 60 + 50]
    for (const idx of inked) { s.grid[idx] = 0; s.marked.push(idx) }
    const c = s.cracks[0]
    for (let i = 0; i < 80; i++) {
      c.alive = false
      findStart(s, c)
      const landed = Math.floor(c.y) * 60 + Math.floor(c.x)
      expect(inked).toContain(landed)
    }
  })

  it('falls back to a fresh random seed only when nothing is inked yet (marked empty)', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 30, 30)
    expect(s.marked).toHaveLength(0) // pre-first-ink degenerate case
    const c = s.cracks[0]; c.alive = false
    findStart(s, c)
    expect(c.alive).toBe(true)
    expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(30)
  })
})

describe('makeCrack', () => {
  it('produces a fresh, alive crack with its own stream', () => {
    const s = createSubstrateState(cfg({ initialCracks: 2 }), 40, 40)
    for (let x = 0; x < 40; x++) { const idx = 20 * 40 + x; s.grid[idx] = 0; s.marked.push(idx) } // give findStart something to land on
    const c = makeCrack(s)
    expect(c.alive).toBe(true)
    expect(typeof c.rng).toBe('function')
  })
})

describe('inked-cell tracking (spawn-from-existing invariant)', () => {
  it('records inked cells in state.marked as the network grows, all non-empty', () => {
    const s = createSubstrateState(cfg({ seed: 4, speed: 120 }), 120, 90)
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)
    expect(s.marked.length).toBeGreaterThan(0)
    for (const idx of s.marked.slice(0, 40)) expect(s.grid[idx]).not.toBe(-1)
  })
})

describe('rayLength', () => {
  it('stops at the first inked cell along the perpendicular', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 60, 60)
    // ink a vertical wall at x=35
    for (let y = 0; y < 60; y++) s.grid[y * 60 + 35] = 90
    // march +x from (30,30): should reach ~5 steps to x=35
    const n = rayLength(s, 30, 30, 0) // perp angle 0 → +x
    expect(n).toBeGreaterThan(3); expect(n).toBeLessThan(7)
  })

  it('stops at the edge when nothing is inked', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 20, 20)
    s.grid.fill(-1)
    const n = rayLength(s, 18, 10, 0) // +x from x=18 in width 20 → ~1-2 steps
    expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(4)
  })
})

describe('regionFill', () => {
  it('paints into the buffer and updates the ray EMA', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, background: '#ffffff' }), 40, 40)
    const before = Array.from(s.buf)
    const ema0 = s.rayAvg
    const c = s.cracks[0]
    c.x = 20; c.y = 20; c.angle = 0; c.color = { r: 200, g: 0, b: 0, a: 1 }
    regionFill(s, c)
    expect(Array.from(s.buf)).not.toEqual(before) // some grains landed
    expect(s.rayAvg).not.toBe(ema0)               // EMA moved
  })

  it('keeps the sand gain within ±SAND_MAXG over many fills', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 80, 80)
    const c = s.cracks[0]; c.x = 40; c.y = 40; c.angle = 0.7
    for (let i = 0; i < 500; i++) regionFill(s, c)
    expect(Math.abs(c.gain)).toBeLessThanOrEqual(SAND_MAXG + 1e-9)
  })
})

describe('stepSubstrate growth', () => {
  it('paints over time and ramps active cracks toward maxCracks', () => {
    const s = createSubstrateState(cfg({ seed: 3, initialCracks: 3, maxCracks: 60, speed: 120 }), 200, 150)
    const before = Array.from(s.buf)
    for (let i = 0; i < 240; i++) stepSubstrate(s, 16) // ~3.8s
    expect(Array.from(s.buf)).not.toEqual(before)
    expect(s.cracks.length).toBeGreaterThan(3)
    expect(s.cracks.length).toBeLessThanOrEqual(60)
  })

  it('same seed + same dt cadence → identical buffer', () => {
    const a = createSubstrateState(cfg({ seed: 11, speed: 100 }), 120, 90)
    const b = createSubstrateState(cfg({ seed: 11, speed: 100 }), 120, 90)
    for (let i = 0; i < 200; i++) { stepSubstrate(a, 16); stepSubstrate(b, 16) }
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf))
    const c = createSubstrateState(cfg({ seed: 12, speed: 100 }), 120, 90)
    for (let i = 0; i < 200; i++) stepSubstrate(c, 16)
    expect(Array.from(c.buf)).not.toEqual(Array.from(a.buf))
  })
})

describe('stepSubstrate lifecycle', () => {
  it('enters fading when drawTime elapses, then reseeds growing', () => {
    const s = createSubstrateState(cfg({ drawTime: 1, fadeTime: 1, speed: 60 }), 80, 80)
    // drawTime is in MINUTES; fast-forward elapsed to just under the threshold (1 min = 60000 ms)
    s.elapsed = s.cfg.drawTime * 60000 - 8
    stepSubstrate(s, 16)                                // crosses drawTime → fading
    expect(s.phase).toBe('fading')
    const cycle0 = s.cycle
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)   // fadeTime (seconds) elapses → reseed
    expect(s.phase).toBe('growing')
    expect(s.cycle).toBe(cycle0 + 1)
    expect(s.elapsed).toBeLessThan(2000)                // reset
  })

  it('fading drives the buffer toward the background colour', () => {
    const s = createSubstrateState(cfg({ drawTime: 1, fadeTime: 1, background: '#ffffff', speed: 80 }), 60, 60)
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)   // grow + paint
    // force into fade
    s.phase = 'fading'; s.fadeElapsed = 0
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)   // full 1s fade
    // after a full fade the canvas is ≈ white again
    expect(s.buf[0]).toBeGreaterThan(250)
    expect(s.buf[1]).toBeGreaterThan(250)
    expect(s.buf[2]).toBeGreaterThan(250)
  })

  it('saturation (forced low rayAvg after warmup) triggers an early fade', () => {
    const s = createSubstrateState(cfg({ drawTime: 180, speed: 60 }), 80, 80)
    for (let i = 0; i < 200; i++) stepSubstrate(s, 16)  // past WARMUP_MS
    s.rayAvg = 1 // pretend the canvas is packed
    stepSubstrate(s, 16)
    expect(s.phase).toBe('fading')
  })
})

describe('updateSubstrateState', () => {
  it('applies live visual params (returns true)', () => {
    const s = createSubstrateState(cfg({ grainOpacity: 0.1 }), 100, 100)
    expect(updateSubstrateState(s, cfg({ grainOpacity: 0.2 }), { width: 100, height: 100 })).toBe(true)
    expect(s.cfg.grainOpacity).toBeCloseTo(0.2)
    expect(updateSubstrateState(s, cfg({ crackColor: '#112233' }), { width: 100, height: 100 })).toBe(true)
    expect(s.crackC).toEqual({ r: 17, g: 34, b: 51, a: 1 })
  })

  it('returns false for structural changes (initialCracks, maxCracks, seed, background)', () => {
    const s = createSubstrateState(cfg(), 100, 100)
    expect(updateSubstrateState(s, cfg({ initialCracks: 5 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSubstrateState(s, cfg({ maxCracks: 300 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSubstrateState(s, cfg({ seed: 99 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSubstrateState(s, cfg({ background: '#000000' }), { width: 100, height: 100 })).toBe(false)
  })
})

describe('resizeSubstrateState', () => {
  it('rebuilds buffer + grid at the new size and refills background', () => {
    const s = createSubstrateState(cfg({ background: '#ffffff' }), 50, 50)
    resizeSubstrateState(s, { width: 80, height: 60 })
    expect(s.w).toBe(80); expect(s.h).toBe(60)
    expect(s.buf.length).toBe(80 * 60 * 4)
    expect(s.grid.length).toBe(80 * 60)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
  })
})

describe('rollCurvature', () => {
  it('is always 0 at straightPct 100 and never 0 at straightPct 0', () => {
    const rngA = mulberry32(1), rngB = mulberry32(2)
    for (let i = 0; i < 60; i++) expect(rollCurvature(cfg({ straightPct: 100 }), rngA)).toBe(0)
    for (let i = 0; i < 60; i++) expect(rollCurvature(cfg({ straightPct: 0 }), rngB)).not.toBe(0)
  })

  it('curved magnitude stays within [STEP/maxR, STEP/minR] and both signs occur', () => {
    const c = cfg({ straightPct: 0, minRadius: 25, maxRadius: 400 })
    const rng = mulberry32(3)
    let pos = false, neg = false
    for (let i = 0; i < 300; i++) {
      const k = rollCurvature(c, rng)
      const mag = Math.abs(k)
      expect(mag).toBeGreaterThanOrEqual(STEP / 400 - 1e-9)
      expect(mag).toBeLessThanOrEqual(STEP / 25 + 1e-9)
      if (k > 0) pos = true
      if (k < 0) neg = true
    }
    expect(pos && neg).toBe(true)
  })

  it('treats minRadius > maxRadius as an unordered range (no crash)', () => {
    const c = cfg({ straightPct: 0, minRadius: 400, maxRadius: 25 })
    const rng = mulberry32(5)
    for (let i = 0; i < 100; i++) {
      const mag = Math.abs(rollCurvature(c, rng))
      expect(mag).toBeGreaterThanOrEqual(STEP / 400 - 1e-9)
      expect(mag).toBeLessThanOrEqual(STEP / 25 + 1e-9)
    }
  })

  it('is roughly half straight at straightPct 50', () => {
    const c = cfg({ straightPct: 50 })
    const rng = mulberry32(7)
    let straight = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (rollCurvature(c, rng) === 0) straight++
    expect(straight / N).toBeGreaterThan(0.4)
    expect(straight / N).toBeLessThan(0.6)
  })
})

describe('advanceCrack curvature', () => {
  it('rotates the heading by curvature each step; 0 holds the heading', () => {
    const s = createSubstrateState(cfg({ straightPct: 100 }), 200, 200)
    const c = s.cracks[0]
    c.x = 100; c.y = 100; c.angle = 0; c.curvature = 0; c.alive = true
    advanceCrack(s, c)
    expect(c.angle).toBe(0)                     // straight: heading unchanged
    c.x = 100; c.y = 100; c.angle = 0; c.curvature = 0.01; c.alive = true
    advanceCrack(s, c)
    expect(c.angle).toBeCloseTo(0.01)           // curved: heading bent by curvature
  })
})

describe('seeded cracks carry a curvature', () => {
  it('assigns curvature 0 to every crack when straightPct is 100', () => {
    const s = createSubstrateState(cfg({ straightPct: 100, initialCracks: 6 }), 100, 100)
    for (const c of s.cracks) expect(c.curvature).toBe(0)
  })
  it('assigns nonzero curvature to every crack when straightPct is 0', () => {
    const s = createSubstrateState(cfg({ straightPct: 0, initialCracks: 6 }), 100, 100)
    for (const c of s.cracks) expect(c.curvature).not.toBe(0)
  })
})

describe('growth is frame-rate independent (#121)', () => {
  // Carrying the un-run backlog in stepAcc (instead of dropping it) makes the total
  // step count depend only on elapsed time, not frame batching — so below the
  // MAX_STEPS×fps throughput ceiling the sim is BIT-IDENTICAL across frame rates.
  const inkedAfter = (dt: number, frames: number) => {
    const s = createSubstrateState(cfg({ seed: 5, speed: 30 }), 120, 120) // speed 30 ≪ ceiling
    for (let i = 0; i < frames; i++) stepSubstrate(s, dt)
    let n = 0
    for (const v of s.grid) if (v !== EMPTY) n++
    return n
  }
  it('60fps and 20fps ink the identical cell count over the same elapsed time', () => {
    // 1500ms: 90 frames @ 16.67ms vs 30 frames @ 50ms.
    expect(inkedAfter(1000 / 60, 90)).toBe(inkedAfter(50, 30))
  })
})

describe('stepSubstrate dirty flag (blit-skip contract, #199)', () => {
  it('returns false on a growing frame that ran zero steps (nothing to blit)', () => {
    const s = createSubstrateState(cfg({ seed: 1, speed: 30 }), 100, 100)
    // A tiny dt keeps stepAcc below 1 → zero steps → buffer untouched → false.
    expect(stepSubstrate(s, 0.01)).toBe(false)
  })

  it('returns true while fading (every pixel is lerped toward bg)', () => {
    const s = createSubstrateState(cfg({ seed: 1 }), 100, 100)
    s.phase = 'fading'
    expect(stepSubstrate(s, 16)).toBe(true)
  })

  it('returns true on a growing frame that actually advanced ≥1 step', () => {
    const s = createSubstrateState(cfg({ seed: 1, speed: 60 }), 100, 100)
    expect(stepSubstrate(s, 100)).toBe(true) // 100ms at speed 60 → many steps
  })
})
