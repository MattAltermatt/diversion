import { describe, it, expect } from 'vitest'
import { wormSchema } from './schema'
import {
  createWormState, stepWormsOnce, stepWorms, updateWormState,
  segSpacingFor, wrapDelta, segColor, FIXED_DT, type WormState,
} from './worm'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

const base = wormSchema.parse({})

// Snapshot every head + segment position so two runs can be compared exactly.
function snapshot(s: WormState): number[] {
  const out: number[] = []
  for (const worm of s.worms) {
    out.push(worm.heading)
    for (const seg of worm.segs) out.push(seg.x, seg.y)
  }
  return out
}

const allFinite = (s: WormState): boolean =>
  s.worms.every((w) => Number.isFinite(w.heading)
    && w.segs.every((seg) => Number.isFinite(seg.x) && Number.isFinite(seg.y)))

describe('schema', () => {
  it('parses with valid defaults', () => {
    expect(base.wormCount).toBe(6)
    expect(base.bodyLength).toBe(44)
    expect(base.colorMode).toBe('per-worm')
    expect(base.trailMode).toBe('clean')
    expect(base.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('round-trips through the URL codec', () => {
    const cfg = {
      ...base, wormCount: 9, thickness: 24, speed: 120, turniness: 0.15,
      colorMode: 'shift-along-body' as const, bodyHueShift: 220, trailMode: 'trails' as const,
      trailFade: 40, background: '#101020',
    }
    const back = decodeConfig(wormSchema, encodeConfig(wormSchema, cfg))
    expect(back.wormCount).toBe(9)
    expect(back.colorMode).toBe('shift-along-body')
    expect(back.trailMode).toBe('trails')
    expect(back.background).toBe('#101020')
    expect(back.turniness).toBeCloseTo(0.15, 10)
  })
})

describe('createWormState', () => {
  it('builds wormCount worms, each with bodyLength segments', () => {
    const s = createWormState({ ...base, wormCount: 5, bodyLength: 30 }, 800, 600)
    expect(s.worms).toHaveLength(5)
    for (const w of s.worms) expect(w.segs).toHaveLength(30)
  })

  it('lays the initial body at the fixed segment spacing', () => {
    const s = createWormState({ ...base, wormCount: 1, thickness: 20 }, 800, 600)
    const spacing = segSpacingFor(20)
    const segs = s.worms[0].segs
    for (let i = 1; i < segs.length; i++) {
      const dx = wrapDelta(segs[i - 1].x - segs[i].x, 800)
      const dy = wrapDelta(segs[i - 1].y - segs[i].y, 600)
      expect(Math.hypot(dx, dy)).toBeCloseTo(spacing, 6)
    }
  })
})

describe('determinism', () => {
  it('same seed → identical worm paths for the first N steps', () => {
    const a = createWormState({ ...base, seed: 777 }, 800, 600)
    const b = createWormState({ ...base, seed: 777 }, 800, 600)
    for (let i = 0; i < 200; i++) { stepWormsOnce(a); stepWormsOnce(b) }
    expect(snapshot(a)).toEqual(snapshot(b))
  })

  it('different seeds → different paths', () => {
    const a = createWormState({ ...base, seed: 1 }, 800, 600)
    const b = createWormState({ ...base, seed: 2 }, 800, 600)
    for (let i = 0; i < 50; i++) { stepWormsOnce(a); stepWormsOnce(b) }
    expect(snapshot(a)).not.toEqual(snapshot(b))
  })

  it('stepWorms drains real time into the same fixed steps', () => {
    const a = createWormState({ ...base, seed: 9 }, 800, 600)
    const b = createWormState({ ...base, seed: 9 }, 800, 600)
    stepWorms(a, FIXED_DT * 3) // three whole steps
    for (let i = 0; i < 3; i++) stepWormsOnce(b)
    expect(snapshot(a)).toEqual(snapshot(b))
  })
})

describe('headline motion', () => {
  it('worms actually move (head positions change)', () => {
    const s = createWormState({ ...base, wormCount: 4, seed: 3 }, 800, 600)
    const before = s.worms.map((w) => ({ x: w.segs[0].x, y: w.segs[0].y }))
    for (let i = 0; i < 30; i++) stepWormsOnce(s)
    let moved = 0
    s.worms.forEach((w, i) => {
      if (Math.hypot(wrapDelta(w.segs[0].x - before[i].x, 800), wrapDelta(w.segs[0].y - before[i].y, 600)) > 1) moved++
    })
    expect(moved).toBe(4)
  })

  it('turns smoothly — heading changes by at most ±turniness per step (no teleport)', () => {
    const cfg = { ...base, turniness: 0.08, seed: 5 }
    const s = createWormState(cfg, 800, 600)
    for (let i = 0; i < 300; i++) {
      const prev = s.worms.map((w) => w.heading)
      stepWormsOnce(s)
      s.worms.forEach((w, k) => {
        expect(Math.abs(w.heading - prev[k])).toBeLessThanOrEqual(cfg.turniness + 1e-9)
      })
    }
  })

  it('keeps the body chain connected at ~constant spacing, even across the wrap seam', () => {
    const cfg = { ...base, wormCount: 3, thickness: 18, speed: 200, seed: 11 }
    const s = createWormState(cfg, 240, 180) // small world → forces edge wraps
    const spacing = segSpacingFor(cfg.thickness)
    for (let step = 0; step < 400; step++) {
      stepWormsOnce(s)
      for (const w of s.worms) {
        for (let i = 1; i < w.segs.length; i++) {
          const dx = wrapDelta(w.segs[i - 1].x - w.segs[i].x, 240)
          const dy = wrapDelta(w.segs[i - 1].y - w.segs[i].y, 180)
          expect(Math.hypot(dx, dy)).toBeCloseTo(spacing, 4)
        }
      }
    }
  })

  it('keeps all positions in-bounds (wrap works) and finite (no NaN)', () => {
    const s = createWormState({ ...base, wormCount: 5, speed: 240, seed: 7 }, 320, 200)
    for (let i = 0; i < 500; i++) stepWormsOnce(s)
    expect(allFinite(s)).toBe(true)
    for (const w of s.worms) {
      for (const seg of w.segs) {
        expect(seg.x).toBeGreaterThanOrEqual(0)
        expect(seg.x).toBeLessThan(320)
        expect(seg.y).toBeGreaterThanOrEqual(0)
        expect(seg.y).toBeLessThan(200)
      }
    }
  })
})

describe('wrapDelta', () => {
  it('returns the minimum-image (shortest signed) distance on a torus', () => {
    expect(wrapDelta(5, 100)).toBe(5)
    expect(wrapDelta(95, 100)).toBe(-5) // shorter to wrap backward
    expect(wrapDelta(-95, 100)).toBe(5)
    expect(wrapDelta(0, 100)).toBe(0)
  })
})

describe('segColor', () => {
  it('gives one constant hue per worm in per-worm mode (head == tail)', () => {
    const s = createWormState({ ...base, wormCount: 1, colorMode: 'per-worm' }, 800, 600)
    expect(segColor(s.worms[0], 0, s.cfg)).toBe(segColor(s.worms[0], 1, s.cfg))
  })

  it('shifts hue along the body in shift-along-body mode (head != tail)', () => {
    const cfg = { ...base, wormCount: 1, colorMode: 'shift-along-body' as const, bodyHueShift: 180 }
    const s = createWormState(cfg, 800, 600)
    expect(segColor(s.worms[0], 0, cfg)).not.toBe(segColor(s.worms[0], 1, cfg))
  })
})

describe('updateWormState', () => {
  it('applies a visual change live, keeping the same worm array', () => {
    const s = createWormState(base, 800, 600)
    const ref = s.worms
    const ok = updateWormState(s, { ...base, speed: base.speed + 40, thickness: base.thickness + 6 })
    expect(ok).toBe(true)
    expect(s.worms).toBe(ref)
    expect(s.cfg.speed).toBe(base.speed + 40)
    expect(s.spacing).toBe(segSpacingFor(base.thickness + 6))
  })

  it('requests a re-setup (false) for structural changes', () => {
    expect(updateWormState(createWormState(base, 800, 600), { ...base, wormCount: base.wormCount + 1 })).toBe(false)
    expect(updateWormState(createWormState(base, 800, 600), { ...base, bodyLength: base.bodyLength + 1 })).toBe(false)
    expect(updateWormState(createWormState(base, 800, 600), { ...base, seed: base.seed + 1 })).toBe(false)
  })
})
