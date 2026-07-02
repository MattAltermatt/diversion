import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveRun, loadRun, clearRun, sameRun, RUN_STORAGE_KEY, RUN_SHAPE_FIELDS, type RunBlob } from './persistence'
import { boxcar2dSchema } from './schema'
import { randomGenome } from './genome'
import { mulberry32 } from '../../framework/rng'

const cfg = boxcar2dSchema.parse({})
const pop = () => Array.from({ length: 4 }, (_, i) => randomGenome(mulberry32(i + 1)))

function blob(over: Partial<RunBlob> = {}): RunBlob {
  return {
    config: cfg,
    population: pop(),
    generation: 12,
    bestDistMeters: 250,
    bestTimeSec: 48.5,
    bestSplits: [12.1, 24.8, 37.0],
    trackSeed: cfg.seed,
    ...over,
  }
}

describe('boxcar2d persistence', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved run', () => {
    const b = blob()
    saveRun(b)
    const got = loadRun()
    expect(got).not.toBeNull()
    expect(got!.generation).toBe(12)
    expect(got!.bestDistMeters).toBe(250)
    expect(got!.bestTimeSec).toBe(48.5)
    expect(got!.trackSeed).toBe(cfg.seed)
    expect(got!.bestSplits).toEqual([12.1, 24.8, 37.0])
    expect(got!.population).toHaveLength(4)
    // genome geometry survives the JSON round-trip
    expect(got!.population[0]).toEqual(b.population[0])
    expect(got!.config.seed).toBe(cfg.seed)
  })

  it('preserves Infinity best-time (JSON drops it otherwise)', () => {
    saveRun(blob({ bestTimeSec: Infinity }))
    expect(loadRun()!.bestTimeSec).toBe(Infinity)
  })

  it('returns null when nothing is stored', () => {
    expect(loadRun()).toBeNull()
  })

  it('returns null (never throws) on corrupt JSON', () => {
    localStorage.setItem(RUN_STORAGE_KEY, '{not json')
    expect(loadRun()).toBeNull()
  })

  it('returns null on a version mismatch', () => {
    saveRun(blob())
    const raw = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!)
    raw.v = 999
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(raw))
    expect(loadRun()).toBeNull()
  })

  it('returns null on a structurally invalid blob (bad config / population)', () => {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({ v: 1, config: { seed: 'nope' }, population: 'x' }))
    expect(loadRun()).toBeNull()
  })

  it('tolerates a blob written before bestSplits existed (defaults to [])', () => {
    saveRun(blob())
    const raw = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!)
    delete raw.bestSplits
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(raw))
    expect(loadRun()!.bestSplits).toEqual([])
  })

  it('clearRun removes the saved run', () => {
    saveRun(blob())
    clearRun()
    expect(loadRun()).toBeNull()
  })

  it('saveRun never throws when storage rejects (quota / disabled)', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => saveRun(blob())).not.toThrow()
    spy.mockRestore()
  })

  it('RUN_SHAPE_FIELDS covers every non-cosmetic schema field (drift guard)', () => {
    // Cosmetic fields intentionally excluded from the resume-match: changing them must
    // not void a resume. Any OTHER schema field defines the run and MUST be in the
    // list — this fails when a new run-shaping field is added and forces a decision.
    const COSMETIC = new Set(['color', 'speed', 'showHud', 'showGhost', 'showLeaderboard'])
    const missing = Object.keys(boxcar2dSchema.shape).filter(
      (k) => !COSMETIC.has(k) && !(RUN_SHAPE_FIELDS as readonly string[]).includes(k),
    )
    expect(missing).toEqual([])
  })

  describe('sameRun — run-shape equality gate', () => {
    it('true for identical run-shaping config', () => {
      expect(sameRun(cfg, boxcar2dSchema.parse({}))).toBe(true)
    })
    it('false when a run-shaping field differs (seed)', () => {
      expect(sameRun(cfg, { ...cfg, seed: cfg.seed + 1 })).toBe(false)
    })
    it('false when population count differs', () => {
      expect(sameRun(cfg, { ...cfg, population: cfg.population + 1 })).toBe(false)
    })
    it('true when only cosmetic fields differ (color / speed / hud)', () => {
      expect(sameRun(cfg, { ...cfg, speed: 8, showHud: false, color: { ...cfg.color, sky: '#000000' } })).toBe(true)
    })
  })
})
