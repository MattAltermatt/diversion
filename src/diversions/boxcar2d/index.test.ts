import { describe, it, expect, beforeEach } from 'vitest'
import diversion, { annealedRate } from './index'
import { boxcar2dSchema, type BoxCar2DConfig } from './schema'

// Reset both module-level persistence decisions before every test (localStorage
// itself is cleared by the global setup beforeEach): the pending resume (explicit
// seed → resumeConfig stashes null) and the armed persist-config (disarm). So a test
// that never opts into resume/persist can't inherit a prior test's state — the
// determinism keystone especially must always start fresh and never persist.
beforeEach(() => {
  diversion.resumeConfig?.(new URLSearchParams('seed=0'), false)
  diversion.armPersistence?.(null)
})

const SIZE = { width: 800, height: 600 }
const cfg = boxcar2dSchema.parse({})

/** Minimal headless 2D-context stub — frame() only issues canvas calls. */
function fakeCtx(): CanvasRenderingContext2D {
  const noop = () => {}
  return {
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    fillText: noop,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 1,
    lineCap: 'butt',
    textBaseline: 'top',
  } as unknown as CanvasRenderingContext2D
}

describe('annealedRate', () => {
  it('cools from the gen-1 peak toward a lower floor', () => {
    const peak = 0.21
    expect(annealedRate(peak, 1)).toBeCloseTo(peak, 6)        // gen 1 = peak
    expect(annealedRate(peak, 9)).toBeCloseTo(peak * 0.25, 6) // by gen 9 = floor (ANNEAL_GENS=8)
    expect(annealedRate(peak, 5)).toBeLessThan(peak)          // monotonically cooling
    expect(annealedRate(peak, 5)).toBeGreaterThan(peak * 0.25)
    expect(annealedRate(peak, 20)).toBeCloseTo(peak * 0.25, 6) // clamps at the floor
  })
})

describe('boxcar2d diversion', () => {
  it('has the required contract fields', () => {
    expect(diversion.id).toBe('boxcar2d')
    expect(diversion.kind).toBe('2d')
    expect(diversion.schema).toBe(boxcar2dSchema)
    expect(diversion.presets?.length).toBeGreaterThan(0)
  })

  it('setup builds state and frame advances without throwing', () => {
    const s = diversion.setup(fakeCtx(), cfg, SIZE)
    expect(s).toBeTruthy()
    expect(s.current).toBeTruthy()
    for (let i = 0; i < 60; i++) diversion.frame(s, fakeCtx(), i * 16, 16)
    diversion.teardown?.(s)
  })

  it(
    'same seed → identical run through gen 3 (determinism keystone)',
    () => {
      // Capture both gen 1 (pre-breeding) AND gen 3 (after breeding + selection +
      // mutation, i.e. the post-setup rng stream) so a regression in the breed/
      // regen rng ordering can't slip past the assertion. A small population keeps
      // the multi-generation run fast; determinism is population-size-independent.
      // rough terrain so cars reliably get culled (the loop terminates fast);
      // small population keeps the multi-generation run quick. Determinism is
      // independent of both.
      const small = boxcar2dSchema.parse({ population: 6, roughness: 1.2 })
      const run = () => {
        const s = diversion.setup(fakeCtx(), small, SIZE)
        let guard = 0
        while (!s.thirdGenFitness && guard++ < 400000) {
          diversion.frame(s, fakeCtx(), guard * 16, 16)
        }
        const out = { first: s.firstGenFitness ?? [], third: s.thirdGenFitness ?? [] }
        diversion.teardown?.(s)
        return out
      }
      const a = run()
      const b = run()
      expect(a.first.length).toBe(small.population)
      expect(a.third.length).toBe(small.population)
      expect(a).toEqual(b)
    },
    30000,
  )

  it(
    'time mode: a car reaching the goal is recorded as a finisher (fitness > goalDistance)',
    () => {
      // Gentle track + a short goal so a car finishes quickly.
      const tcfg = boxcar2dSchema.parse({ mode: 'time', goalDistance: 60, timeCap: 30, roughness: 0.1, population: 6, speed: 8 })
      const s = diversion.setup(fakeCtx(), tcfg, SIZE)
      let guard = 0
      let sawFinisher = false
      while (guard++ < 200000 && !sawFinisher) {
        diversion.frame(s, fakeCtx(), guard * 16, 16)
        if (s.scored.some((sc) => sc.fitness > tcfg.goalDistance)) sawFinisher = true
      }
      diversion.teardown?.(s)
      expect(sawFinisher).toBe(true)
    },
    30000,
  )

  // ----- persistence / resume (#226) -----

  const RESUME_CFG = boxcar2dSchema.parse({ population: 5, roughness: 1.2, speed: 8 })

  /** Drive a fresh, PERSISTABLE run until it reaches `targetGen` (auto-saves fire at
   *  each gen boundary). Arms persistence for RESUME_CFG exactly as a seedless Play
   *  mount would (armPersistence with the mounted config), then runs. Rough terrain +
   *  fast-forward so generations turn over quickly. */
  function runToGeneration(targetGen: number): ReturnType<typeof diversion.setup> {
    diversion.armPersistence!(RESUME_CFG)
    const s = diversion.setup(fakeCtx(), RESUME_CFG, SIZE)
    let guard = 0
    while (s.generation < targetGen && guard++ < 400000) diversion.frame(s, fakeCtx(), guard * 16, 16)
    return s
  }
  const genOf = () => JSON.parse(localStorage.getItem('diversion:boxcar2d:run')!).generation

  it(
    'auto-persists each generation and resumes the bred population on a direct seedless visit',
    () => {
      const a = runToGeneration(4)
      const savedGen = a.generation
      const savedGenomes: unknown = JSON.parse(JSON.stringify(a.population))
      diversion.teardown?.(a)
      expect(savedGen).toBeGreaterThanOrEqual(4)

      // direct seedless visit → resumeConfig hands back the saved config; setup restores it
      const resumeCfg = diversion.resumeConfig!(new URLSearchParams(''), true)
      expect(resumeCfg).not.toBeNull()
      const b = diversion.setup(fakeCtx(), resumeCfg as BoxCar2DConfig, SIZE)
      expect(b.generation).toBe(savedGen)
      expect(b.population).toEqual(savedGenomes) // the bred champions, not a fresh gen 1
      diversion.teardown?.(b)
    },
    30000,
  )

  it(
    'an in-app Play click (direct=false) honors its config and does NOT resume',
    () => {
      diversion.teardown?.(runToGeneration(4))
      // seedless but not direct (PUSH) → no resume even though a saved run exists
      expect(diversion.resumeConfig!(new URLSearchParams(''), false)).toBeNull()
      const b = diversion.setup(fakeCtx(), RESUME_CFG, SIZE)
      expect(b.generation).toBe(1)
      diversion.teardown?.(b)
    },
    30000,
  )

  it(
    'an explicit ?seed starts a FRESH run and never overwrites the bred run (share-link safety)',
    () => {
      diversion.teardown?.(runToGeneration(4))
      const bred = genOf()
      expect(bred).toBeGreaterThanOrEqual(4)

      // explicit seed → no resume, and PlayScreen disarms persistence for this session
      expect(diversion.resumeConfig!(new URLSearchParams('seed=99'), true)).toBeNull()
      diversion.armPersistence!(null)
      const b = diversion.setup(fakeCtx(), boxcar2dSchema.parse({ seed: 99, population: 5, roughness: 1.2, speed: 8 }), SIZE)
      expect(b.generation).toBe(1)
      let guard = 0
      while (b.generation < 3 && guard++ < 400000) diversion.frame(b, fakeCtx(), guard * 16, 16)
      diversion.teardown?.(b)
      // the bred run in the slot is untouched by the explicit-seed session
      expect(genOf()).toBe(bred)
    },
    30000,
  )

  it(
    'a non-Play mount (Config preview / Gallery thumbnail) never writes the resume slot',
    () => {
      // Breed + persist a run, then simulate a LEAK: persistFor is left armed for the
      // bred run (a Config-preview mount never calls armPersistence, so a sticky value
      // from the prior Play mount could survive). A different-config run must still not
      // clobber the slot — the sameRun write-gate blocks it. (#226 review must-fix #1.)
      diversion.teardown?.(runToGeneration(4))
      const bred = genOf()
      // deliberately do NOT disarm — this is the stale-global case the gate must survive
      const preview = boxcar2dSchema.parse({ seed: 777, population: 6, roughness: 0.7, speed: 8 })
      const p = diversion.setup(fakeCtx(), preview, SIZE)
      let guard = 0
      while (p.generation < 3 && guard++ < 400000) diversion.frame(p, fakeCtx(), guard * 16, 16)
      diversion.teardown?.(p)
      expect(genOf()).toBe(bred) // untouched by the foreign-config mount
    },
    30000,
  )

  it(
    'clearPersistedRun discards the saved run (the "New run" control)',
    () => {
      diversion.teardown?.(runToGeneration(3))
      expect(diversion.resumeConfig!(new URLSearchParams(''), true)).not.toBeNull()
      diversion.clearPersistedRun!()
      expect(diversion.resumeConfig!(new URLSearchParams(''), true)).toBeNull()
    },
    30000,
  )

  it('rubble density > 0 spawns blocks once a car passes the launch gap, without throwing', () => {
    // Rubble only begins after the RUBBLE_START_GAP (100 m) launch zone, so drive
    // the sim (speed fast-forward) until a car gets close enough to the field to
    // trigger block spawning, then assert blocks exist.
    const rcfg = boxcar2dSchema.parse({ rubbleDensity: 4, population: 6, speed: 8 })
    const s = diversion.setup(fakeCtx(), rcfg, SIZE)
    let guard = 0
    while (guard++ < 40000 && s.rubbleBlocks.size === 0) {
      diversion.frame(s, fakeCtx(), guard * 16, 16)
    }
    expect(s.rubbleBlocks.size).toBeGreaterThan(0)
    diversion.teardown?.(s)
  }, 20000)
})
