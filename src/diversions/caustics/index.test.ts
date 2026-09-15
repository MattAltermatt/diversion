import { describe, it, expect, vi } from 'vitest'
import caustics from './index'
import { causticsSchema } from './schema'
import { buildSpectrum } from './spectrum'
import { accSizeFor, initGL, resizeTargets } from './gl'
import { makeGLContext } from '../../test-setup'
import { meta } from './meta'

// An earlier version of this test set next[k] to its OWN current value, so
// nothing was ever different, neither branch ran, and it passed against an
// `update` whose entire body was `return true`.
const ALT: Record<string, unknown> = {
  tempo: 0.004, ripple: 0.02, gust: 0.8, slosh: 0.1, depth: 3, scale: 5,
  background: '#101010', light: '#ffffff', floor: 'Sand',
  seed: 999, tilt: 2.4, spread: 0.9, tileSize: 0.8,
}

describe('caustics identity + presets', () => {
  it('agrees with its own meta and is webgl', () => {
    expect(caustics.id).toBe(meta.id)
    expect(caustics.id).toBe('caustics')
    expect(caustics.title).toBe(meta.title)
    expect(caustics.kind).toBe('webgl')
  })

  it('declares both preset groups', () => {
    expect(caustics.presets?.map((g) => g.label).sort()).toEqual(['Palette', 'Water'])
  })
})

describe('caustics update()', () => {
  it('applies every field live, and actually advances the state', () => {
    const cfg = causticsSchema.parse({})
    const state = { gl: null, res: null, cfg, spec: buildSpectrum(cfg), clock: 0 } as never

    for (const k of Object.keys(causticsSchema.shape)) {
      expect(Object.prototype.hasOwnProperty.call(ALT, k)).toBe(true)
      expect(ALT[k]).not.toEqual((cfg as Record<string, unknown>)[k])

      const nextCfg = causticsSchema.parse({ ...cfg, [k]: ALT[k] })
      const handled = caustics.update!(state, nextCfg, { width: 800, height: 600 })

      expect(handled).toBe(true)
      expect((state as unknown as { cfg: Record<string, unknown> }).cfg[k]).toEqual(ALT[k])
    }
  })

  // Swept over EVERY field, not one positive and one negative. Mutation-checked:
  // with only the gust/tilt pair, `SPECTRAL = ['tilt','spread']` and
  // `SPECTRAL = ['tilt','seed']` each passed the whole suite -- leaving a shipped
  // Advanced slider completely inert, which is the exact failure the split exists
  // to prevent. The iff also closes the opposite direction: adding a uniform-only
  // field to SPECTRAL would rebuild the spectrum on every pointermove of its drag.
  it('rebuilds the spectrum for exactly the fields that change the trains', () => {
    const SPECTRAL = ['tilt', 'spread', 'seed']
    const wrong: string[] = []
    for (const k of Object.keys(causticsSchema.shape)) {
      const cfg = causticsSchema.parse({})
      const state = { gl: null, res: null, cfg, spec: buildSpectrum(cfg), clock: 0 } as never
      const before = (state as unknown as { spec: unknown }).spec
      caustics.update!(state, causticsSchema.parse({ ...cfg, [k]: ALT[k] }), { width: 800, height: 600 })
      const rebuilt = (state as unknown as { spec: unknown }).spec !== before
      if (rebuilt !== SPECTRAL.includes(k)) {
        wrong.push(`${k}: rebuilt=${rebuilt}, expected=${SPECTRAL.includes(k)}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('applies slosh to the standing mask', () => {
    const cfg = causticsSchema.parse({})
    const spec = buildSpectrum(cfg)
    expect(Array.from(spec.standing).filter(Boolean).length).toBe(7)

    const state = { gl: null, res: null, cfg, spec, clock: 0 } as never
    caustics.update!(state, causticsSchema.parse({ ...cfg, slosh: 0.1 }), { width: 800, height: 600 })

    const s = (state as unknown as { spec: { standing: Uint8Array } }).spec
    expect(Array.from(s.standing).filter(Boolean).length).toBe(1)
  })
})

describe('caustics frame() clock', () => {
  // The single highest-risk line in the port, and it had ZERO coverage: mutating
  // `(dt / 1000)` to `dt` passed all 48 tests. The framework's dt is MILLISECONDS
  // and the mockup this was ported from used seconds, so the naive port runs the
  // piece 1000x too fast -- destroying the one property the brief is about.
  // diversionSmoke only asserts that a draw happened.
  it('advances the clock in SECONDS from a millisecond dt', () => {
    const gl = makeGLContext()
    const cfg = causticsSchema.parse({})
    const state = caustics.setup(gl, cfg, { width: 800, height: 600 }) as { clock: number }
    caustics.frame(state as never, gl, 16, 16)
    expect(state.clock).toBeCloseTo((16 / 1000) * cfg.tempo * 60, 12)
  })

  // ACCUMULATES rather than being a function of `t`. `uTime = t * tempo` would
  // pass the test above on frame 1 and then teleport the whole surface on every
  // intermediate value of a live Tempo drag.
  it('integrates rather than deriving the clock from t', () => {
    const gl = makeGLContext()
    const cfg = causticsSchema.parse({})
    const state = caustics.setup(gl, cfg, { width: 800, height: 600 }) as { clock: number }
    caustics.frame(state as never, gl, 16, 16)
    caustics.frame(state as never, gl, 32, 16)
    caustics.frame(state as never, gl, 48, 16)
    expect(state.clock).toBeCloseTo(3 * (16 / 1000) * cfg.tempo * 60, 12)
  })
})

describe('caustics resize()', () => {
  it('resizes the accumulation target, not merely declaring the hook', () => {
    const gl = makeGLContext()
    const res = initGL(gl as unknown as WebGL2RenderingContext)
    resizeTargets(gl as unknown as WebGL2RenderingContext, res, 800, 600)
    const before = res.accW

    const cfg = causticsSchema.parse({})
    const spec = buildSpectrum(cfg)
    caustics.resize!(
      { gl, res, cfg, spec, clock: 0 } as never,
      { width: 1200, height: 700 },
      gl as unknown as WebGL2RenderingContext,
    )

    expect(res.accW).not.toBe(before)
    expect(res.accW).toBe(accSizeFor(1200, 700).accW)
  })
})

describe('caustics teardown()', () => {
  it('frees its GL resources on teardown', () => {
    const gl = {
      deleteProgram: vi.fn(),
      deleteVertexArray: vi.fn(),
      deleteTexture: vi.fn(),
      deleteFramebuffer: vi.fn(),
    }
    const res = { splat: {}, resolve: {}, vao: {}, accTex: {}, accFBO: {} }

    caustics.teardown!({ gl, res } as never)

    expect(gl.deleteProgram).toHaveBeenCalledTimes(2)
    expect(gl.deleteTexture).toHaveBeenCalled()
    expect(gl.deleteFramebuffer).toHaveBeenCalled()
  })
})
