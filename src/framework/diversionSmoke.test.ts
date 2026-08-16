import { describe, it, expect } from 'vitest'
import { allDiversions } from './testRegistry'
import type { RenderContext } from './types'
import {
  make2DContext,
  makeGLContext,
  type Mock2DContext,
  type MockGLContext,
} from '../test-setup'

// Per-diversion smoke sweep (#128): drive every registered diversion's real
// setup() + a few frame() ticks against a call-recording mock context (2D or
// WebGL, chosen by `kind`). This exercises the actual draw path — catching a
// typo'd or removed ctx call that TypeScript can't see (the context is the
// erased RenderContext union, so `ctx.fillRct(...)` would compile) — without a
// real GPU. Because it sweeps `allDiversions`, any future diversion is
// covered automatically the moment its folder lands.
//
// jsdom note: there is no real WebGL2 here, so `makeGLContext()` returns truthy
// shader/program handles and passing COMPILE/LINK status — enough for a
// shader-building setup() (plasma/metaballs) to run end-to-end. A genuine
// shader-compile error therefore can't surface here; that's covered separately
// in-browser. This sweep guards the JS draw-call surface, not GLSL correctness.
//
// webgpu note: jsdom has no `navigator.gpu` at all, so a kind:'webgpu' diversion's
// device acquisition rejects and its ready-flag keeps frame() a no-op — there is no
// GPU draw path to exercise here. For those we assert only that setup()+frame() run
// without throwing (the not-ready branch); the real GPU path is Chrome-verified,
// exactly as GLSL correctness is.

// 2D calls that count as "something was actually drawn".
const DRAW_2D = ['fillRect', 'fill', 'stroke', 'drawImage', 'putImageData', 'clearRect']
// WebGL draw calls.
const DRAW_GL = ['drawArrays']

const SIZE = { width: 400, height: 300 }

describe('diversion smoke sweep (#128)', () => {
  const diversions = allDiversions

  it('registers at least one diversion to sweep', () => {
    expect(diversions.length).toBeGreaterThan(0)
  })

  it.each(diversions.map((d) => [d.id, d] as const))(
    '%s: setup() + frame() ticks run and emit a draw call',
    (_id, diversion) => {
      const config = diversion.schema.parse({}) // all-defaults config
      const ctx: Mock2DContext | MockGLContext =
        diversion.kind === '2d' ? make2DContext() : makeGLContext()

      let state: unknown
      expect(() => {
        state = diversion.setup(ctx as unknown as RenderContext & never, config, SIZE)
      }).not.toThrow()

      expect(() => {
        let t = 0
        for (let i = 0; i < 5; i++) {
          t += 16
          diversion.frame(state as never, ctx as unknown as RenderContext & never, t, 16)
        }
      }).not.toThrow()

      // webgpu can't reach its GPU draw path in jsdom (no navigator.gpu) — the
      // no-throw checks above cover its ready-gate; skip the draw-call assertion.
      if (diversion.kind === 'webgpu') return

      const draws = diversion.kind === '2d' ? DRAW_2D : DRAW_GL
      const drew = ctx.calls.some((c) => draws.includes(c))
      expect(drew, `${diversion.id} made no draw call; saw: ${[...new Set(ctx.calls)].join(', ')}`).toBe(
        true,
      )
    },
  )
})
