import { describe, it, expect } from 'vitest'
import {
  createFlowState, updateFlowState, hexToRgba, trailFadeAlpha, toHex2, sampleGradient, colorSourceT,
} from './flowField'
import { flowFieldSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

const base = flowFieldSchema.parse({})

describe('hexToRgba', () => {
  it('converts #rrggbbaa to an rgba() string (alpha rounded to 3 dp)', () => {
    expect(hexToRgba('#1e63ff1f')).toBe('rgba(30, 99, 255, 0.122)')
    expect(hexToRgba('#102030ff')).toBe('rgba(16, 32, 48, 1)')
    expect(hexToRgba('#00000000')).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('createFlowState palette', () => {
  it('precomputes one rgba style per palette color', () => {
    const s = createFlowState({ ...base, particles: 20 }, 800, 600)
    expect(s.styles).toHaveLength(base.color.colors.length)
    expect(s.styles[0]).toBe(hexToRgba(base.color.colors[0]))
  })

  it('assigns every particle a color index within the palette range', () => {
    const n = base.color.colors.length
    const s = createFlowState({ ...base, particles: 200 }, 800, 600)
    for (const p of s.particles) {
      expect(p.ci).toBeGreaterThanOrEqual(0)
      expect(p.ci).toBeLessThan(n)
      expect(Number.isInteger(p.ci)).toBe(true)
    }
  })
})

describe('createFlowState determinism', () => {
  it('produces identical particle layouts for the same seed', () => {
    const a = createFlowState({ ...base, particles: 50, seed: 777 }, 800, 600)
    const b = createFlowState({ ...base, particles: 50, seed: 777 }, 800, 600)
    expect(a.particles).toEqual(b.particles)
  })

  it('produces different layouts for different seeds', () => {
    const a = createFlowState({ ...base, particles: 50, seed: 1 }, 800, 600)
    const b = createFlowState({ ...base, particles: 50, seed: 2 }, 800, 600)
    expect(a.particles).not.toEqual(b.particles)
  })
})

describe('trailFadeAlpha', () => {
  // Trail length is perceptual: a mark survives ~1/fadeAlpha frames. We map the
  // slider LINEARLY in survival-frames (1..50), so equal slider steps feel like
  // equal trail-length changes. Endpoints preserved: 0 = hard wipe (1 frame,
  // alpha 1.0), 100 = longest trail (50 frames, alpha 0.02).
  const frames = (t: number) => 1 / trailFadeAlpha(t)

  it('maps 0 -> full wipe (1.0) and 100 -> the floor (0.02)', () => {
    expect(trailFadeAlpha(0)).toBe(1)
    expect(trailFadeAlpha(100)).toBeCloseTo(0.02, 5)
  })
  it('is monotonically decreasing in trail length', () => {
    expect(trailFadeAlpha(20)).toBeGreaterThan(trailFadeAlpha(80))
  })
  it('spaces trail length evenly: the 99->100 step is no bigger than a mid step', () => {
    // The whole point of the perceptual remap — no cliff at the top of the slider.
    const topStep = frames(100) - frames(99)
    const midStep = frames(51) - frames(50)
    expect(topStep).toBeCloseTo(midStep, 6)
  })
  it('places the default (88) near the long end of the survival-frame range', () => {
    expect(frames(88)).toBeCloseTo(1 + 0.88 * 49, 4) // ~44 frames
  })
})

describe('toHex2', () => {
  it('converts a 0..1 alpha to a 2-digit hex byte', () => {
    expect(toHex2(1)).toBe('ff')
    expect(toHex2(0)).toBe('00')
    expect(toHex2(0.1376)).toBe('23') // round(0.1376*255)=35=0x23
  })
})

describe('lifespan-derived particle life', () => {
  it('keeps every particle life within [lifespan/3, lifespan] seconds', () => {
    const cfg = flowFieldSchema.parse({})
    const lo = (cfg.lifespan / 3) * 1000 // derive from the default, not a literal
    const hi = cfg.lifespan * 1000
    const s = createFlowState({ ...cfg, particles: 300 }, 800, 600)
    for (const p of s.particles) {
      expect(p.life).toBeGreaterThanOrEqual(lo)
      expect(p.life).toBeLessThanOrEqual(hi)
    }
  })
  it('scales the bounds with the lifespan slider (12s -> [4000, 12000])', () => {
    const cfg = flowFieldSchema.parse({})
    const s = createFlowState({ ...cfg, particles: 300, lifespan: 12 }, 800, 600)
    for (const p of s.particles) {
      expect(p.life).toBeGreaterThanOrEqual(4000)
      expect(p.life).toBeLessThanOrEqual(12000)
    }
  })
})

describe('schema defaults', () => {
  it('defaults blend to normal (color-true out of the box)', () => {
    expect(flowFieldSchema.parse({}).blend).toBe('normal')
  })
  it('pins the curated defaults (Slow Fuzz: trailLength 72, lifespan 6.5, particles 16200)', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.trailLength).toBe(72)
    expect(cfg.lifespan).toBe(6.5)
    expect(cfg.particles).toBe(16200)
  })
})

describe('sampleGradient', () => {
  it('returns the first stop at t=0 and the last stop at t=1 (non-wrap)', () => {
    expect(sampleGradient(['#ff000080', '#0000ff80'], 0, false)).toBe('rgba(255, 0, 0, 0.502)')
    expect(sampleGradient(['#ff000080', '#0000ff80'], 1, false)).toBe('rgba(0, 0, 255, 0.502)')
  })
  it('linearly interpolates at the midpoint of two stops', () => {
    expect(sampleGradient(['#ff000080', '#0000ff80'], 0.5, false)).toBe('rgba(128, 0, 128, 0.502)')
  })
  it('locates the right segment among many evenly-spaced stops', () => {
    // 3 stops, non-wrap → 2 segments; t=0.5 lands exactly on the middle stop
    expect(sampleGradient(['#ff0000ff', '#00ff00ff', '#0000ffff'], 0.5, false)).toBe('rgba(0, 255, 0, 1)')
  })
  it('wraps the last stop back to the first when wrap=true', () => {
    const stops = ['#ff0000ff', '#00ff00ff', '#0000ffff'] // 3 stops, wrap → 3 segments
    // t=1 closes the loop back to stop0
    expect(sampleGradient(stops, 1, true)).toBe('rgba(255, 0, 0, 1)')
    // t=5/6 is the midpoint of the wrap segment (blue -> red)
    expect(sampleGradient(stops, 5 / 6, true)).toBe('rgba(128, 0, 128, 1)')
  })
  it('clamps t outside [0,1]', () => {
    expect(sampleGradient(['#ff000080', '#0000ff80'], -1, false)).toBe('rgba(255, 0, 0, 0.502)')
    expect(sampleGradient(['#ff000080', '#0000ff80'], 2, false)).toBe('rgba(0, 0, 255, 0.502)')
  })
})

describe('colorSourceT', () => {
  it('normalizes x and y position to [0,1] and clamps', () => {
    expect(colorSourceT('x', 400, 0, 0, 800, 600)).toBeCloseTo(0.5, 6)
    expect(colorSourceT('y', 0, 300, 0, 800, 600)).toBeCloseTo(0.5, 6)
    expect(colorSourceT('x', 1000, 0, 0, 800, 600)).toBe(1) // clamp over
    expect(colorSourceT('y', 0, -50, 0, 800, 600)).toBe(0) // clamp under
  })
  it('maps flow-angle into [0,1) cyclically', () => {
    expect(colorSourceT('flow-angle', 0, 0, 0, 800, 600)).toBeCloseTo(0, 6)
    expect(colorSourceT('flow-angle', 0, 0, Math.PI, 800, 600)).toBeCloseTo(0.5, 6)
    expect(colorSourceT('flow-angle', 0, 0, 2 * Math.PI, 800, 600)).toBeCloseTo(0, 6) // wraps to 0
    expect(colorSourceT('flow-angle', 0, 0, -Math.PI / 2, 800, 600)).toBeCloseTo(0.75, 6) // negative wraps
  })
})

describe('color-panel schema defaults', () => {
  it('defaults color.mode to palette (today\'s look preserved)', () => {
    expect(flowFieldSchema.parse({}).color.mode).toBe('palette')
  })
  it('keeps background as a top-level field (shared across modes)', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.background).toBe('#050810')
    expect('background' in cfg.color).toBe(false)
  })
  it('defaults the gradient controls: flow-angle source + >=2 evenly-spaced stops', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.color.source).toBe('flow-angle')
    expect(cfg.color.stops.length).toBeGreaterThanOrEqual(2)
    for (const s of cfg.color.stops) expect(s).toMatch(/^#[0-9a-fA-F]{8}$/)
  })
})

describe('color-panel codec round-trip', () => {
  it('round-trips color.mode, gradient source/stops, and top-level background', () => {
    const defaults = flowFieldSchema.parse({})
    const cfg = {
      ...defaults,
      background: '#101018',
      color: {
        ...defaults.color,
        mode: 'gradient' as const,
        source: 'x' as const,
        stops: ['#11223344', '#55667788', '#99aabbcc'],
      },
    }
    const sp = encodeConfig(flowFieldSchema, cfg)
    const back = decodeConfig(flowFieldSchema, sp)
    expect(back.color.mode).toBe('gradient')
    expect(back.background).toBe('#101018')
    expect(back.color.source).toBe('x')
    expect(back.color.stops).toEqual(['#11223344', '#55667788', '#99aabbcc'])
  })
})

describe('updateFlowState', () => {
  it('applies a visual change live, keeping the same particle array', () => {
    const state = createFlowState(base, 800, 600)
    const particlesRef = state.particles
    const ok = updateFlowState(state, { ...base, speed: base.speed + 0.2 })
    expect(ok).toBe(true)
    expect(state.cfg.speed).toBe(base.speed + 0.2)
    expect(state.particles).toBe(particlesRef) // no realloc
  })

  it('recomputes palette styles when colors change', () => {
    const state = createFlowState(base, 800, 600)
    const nextColors = [...base.color.colors]
    nextColors[0] = '#abcdefff'
    const ok = updateFlowState(state, { ...base, color: { ...base.color, colors: nextColors } })
    expect(ok).toBe(true)
    expect(state.styles[0]).toBe('rgba(171, 205, 239, 1)')
  })

  it('requests a re-setup (false) when particle count changes', () => {
    const state = createFlowState(base, 800, 600)
    expect(updateFlowState(state, { ...base, particles: base.particles + 100 })).toBe(false)
  })

  it('requests a re-setup (false) when the seed changes', () => {
    const state = createFlowState(base, 800, 600)
    expect(updateFlowState(state, { ...base, seed: base.seed + 1 })).toBe(false)
  })
})

import { advanceFieldTime } from './flowField'

describe('field drift', () => {
  it('does not advance fieldTime when drift is 0 (frozen field)', () => {
    expect(advanceFieldTime(0, 16, 0)).toBe(0)
    expect(advanceFieldTime(42, 16, 0)).toBe(42)
  })

  it('advances fieldTime proportionally to dt and drift', () => {
    const half = advanceFieldTime(0, 16, 0.5)
    expect(half).toBeGreaterThan(0)
    expect(advanceFieldTime(0, 16, 1.0)).toBeCloseTo(half * 2, 10)
    expect(advanceFieldTime(0, 32, 0.5)).toBeCloseTo(half * 2, 10)
  })

  it('accumulates from the current fieldTime', () => {
    const step = advanceFieldTime(0, 16, 0.5)
    expect(advanceFieldTime(10, 16, 0.5)).toBeCloseTo(10 + step, 10)
  })

  it('createFlowState starts fieldTime at 0', () => {
    expect(createFlowState(base, 800, 600).fieldTime).toBe(0)
  })

  it('updateFlowState applies fieldDrift live without resetting fieldTime', () => {
    const state = createFlowState(base, 800, 600)
    state.fieldTime = 12.5 // pretend it has been drifting
    const ok = updateFlowState(state, { ...base, fieldDrift: 0.5 })
    expect(ok).toBe(true)
    expect(state.cfg.fieldDrift).toBe(0.5)
    expect(state.fieldTime).toBe(12.5) // morph continues, not reset
  })

  it('defaults fieldDrift to 0.71 and round-trips a non-zero value', () => {
    expect(flowFieldSchema.parse({}).fieldDrift).toBe(0.71)
    const sp = encodeConfig(flowFieldSchema, { ...base, fieldDrift: 0.3 })
    expect(decodeConfig(flowFieldSchema, sp).fieldDrift).toBeCloseTo(0.3, 10)
  })
})
