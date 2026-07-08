import { describe, it, expect } from 'vitest'
import { REST, WAVE, RECOVER, stepField, seedPacemakers, fieldDims, type Field } from './field'
import { slimeAggregationSchema } from './schema'

// A rng() double that returns 0.5: never crosses the tiny SPONTANEOUS_RATE
// threshold (so rest cells don't spontaneously flicker), but still resolves
// the deterministic-ignite case (excitability 1 → threshold 0 → 0.5 >= 0).
const midRng = () => 0.5

function emptyField(gw: number, gh: number): Field {
  return {
    gw, gh,
    state: new Uint8Array(gw * gh), stateB: new Uint8Array(gw * gh),
    timer: new Uint16Array(gw * gh), timerB: new Uint16Array(gw * gh),
    pacemakers: [],
    rng: midRng,
  }
}

describe('fieldDims', () => {
  it('derives a grid at least 8x8 from canvas size / cellSize', () => {
    expect(fieldDims(800, 600, 8)).toEqual({ gw: 100, gh: 75 })
    expect(fieldDims(10, 10, 8)).toEqual({ gw: 8, gh: 8 })
  })
})

describe('field: an excitable cell fires then refracts', () => {
  it('a WAVE cell counts down to RECOVER, then RECOVER counts down to REST', () => {
    // excitability floored low enough (with midRng) that neighbours never catch —
    // isolates the single cell's own fire→refract→rest lifecycle.
    const cfg = slimeAggregationSchema.parse({ waveWidth: 3, recoveryTime: 2, excitability: 0.05 })
    const f = emptyField(5, 5)
    const center = 2 * 5 + 2
    f.state[center] = WAVE
    f.timer[center] = cfg.waveWidth

    for (let i = 0; i < cfg.waveWidth - 1; i++) {
      stepField(f, cfg)
      expect(f.state[center]).toBe(WAVE)
    }
    stepField(f, cfg) // last WAVE tick → fires into RECOVER
    expect(f.state[center]).toBe(RECOVER)
    expect(f.timer[center]).toBe(cfg.recoveryTime)

    for (let i = 0; i < cfg.recoveryTime - 1; i++) {
      stepField(f, cfg)
      expect(f.state[center]).toBe(RECOVER)
    }
    stepField(f, cfg) // last RECOVER tick → refracts back to REST
    expect(f.state[center]).toBe(REST)
  })
})

describe('field: a wave propagates to a neighbor', () => {
  it('a REST cell adjacent to a WAVE cell ignites when excitability is high', () => {
    const cfg = slimeAggregationSchema.parse({ excitability: 1, waveWidth: 5, recoveryTime: 10 })
    const f = emptyField(5, 5)
    const cx = 2, cy = 2
    const center = cy * 5 + cx
    f.state[center] = WAVE
    f.timer[center] = cfg.waveWidth

    stepField(f, cfg)

    const west = cy * 5 + ((cx - 1 + 5) % 5)
    expect(f.state[west]).toBe(WAVE)
    expect(f.timer[west]).toBe(cfg.waveWidth)
  })

  it('a REST cell far from any WAVE never ignites (low excitability, no exposure)', () => {
    const cfg = slimeAggregationSchema.parse({ excitability: 0.05, waveWidth: 5, recoveryTime: 10 })
    const f = emptyField(9, 9)
    const center = 4 * 9 + 4
    f.state[center] = WAVE
    f.timer[center] = cfg.waveWidth
    stepField(f, cfg)
    const far = 0 * 9 + 0
    expect(f.state[far]).toBe(REST)
  })
})

describe('seedPacemakers', () => {
  it('is deterministic per seed and places exactly pacemakerCount points', () => {
    const cfg = slimeAggregationSchema.parse({ pacemakerCount: 5 })
    const a = seedPacemakers(cfg, 11)
    const b = seedPacemakers(cfg, 11)
    expect(a.length).toBe(5)
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    const cfg = slimeAggregationSchema.parse({ pacemakerCount: 4 })
    const a = seedPacemakers(cfg, 1)
    const b = seedPacemakers(cfg, 2)
    expect(a).not.toEqual(b)
  })

  it('places every pacemaker within the normalized [0,1) world', () => {
    const cfg = slimeAggregationSchema.parse({ pacemakerCount: 8 })
    for (const pm of seedPacemakers(cfg, 3)) {
      expect(pm.nx).toBeGreaterThanOrEqual(0); expect(pm.nx).toBeLessThan(1)
      expect(pm.ny).toBeGreaterThanOrEqual(0); expect(pm.ny).toBeLessThan(1)
      expect(pm.period).toBeGreaterThan(0)
    }
  })
})

describe('pacemakers force-fire a resting cell on schedule', () => {
  it('ignites its cell once its countdown reaches 0, and not before', () => {
    const cfg = slimeAggregationSchema.parse({ excitability: 0.05, waveWidth: 4, recoveryTime: 10 })
    const f = emptyField(10, 10)
    f.pacemakers = [{ nx: 0.45, ny: 0.45, period: 5, countdown: 3 }]
    for (let i = 0; i < 2; i++) {
      stepField(f, cfg)
      expect(f.pacemakers[0].countdown).toBeGreaterThan(0)
    }
    // third step: countdown hits 0 and force-fires
    stepField(f, cfg)
    const idx = 4 * 10 + 4
    expect(f.state[idx]).toBe(WAVE)
    expect(f.pacemakers[0].countdown).toBe(5)
  })
})
