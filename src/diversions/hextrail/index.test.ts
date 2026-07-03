import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import type { RenderContext, Size } from '../../framework/types'
import hextrail from './index'
import { hextrailSchema, type HextrailConfig } from './schema'

const parse = (o: Record<string, unknown> = {}): HextrailConfig => hextrailSchema.parse(o) as HextrailConfig

const SIZE: Size = { width: 400, height: 300 }
const asCtx = (c: unknown) => c as RenderContext & never

describe('hextrail diversion wiring', () => {
  it('runs a long screensaver stretch through a full loop without throwing', () => {
    const ctx = make2DContext()
    const config = parse({ holdSeconds: 0, fadeSeconds: 1, growthSpeed: 50 })
    const state = hextrail.setup(asCtx(ctx), config, SIZE)
    expect(() => {
      let t = 0
      // ~40s at 60fps — long enough to fill, hold, fade and reseed several times
      for (let i = 0; i < 2400; i++) {
        t += 16
        hextrail.frame(state, asCtx(ctx), t, 16)
      }
    }).not.toThrow()
    // it drew (blit + strokes) and used no Path2D (jsdom lacks it)
    expect(ctx.calls).toContain('drawImage')
    expect(ctx.calls).toContain('stroke')
  })

  it('applies live edits and re-sizes without a re-setup crash', () => {
    const ctx = make2DContext()
    const state = hextrail.setup(asCtx(ctx), parse(), SIZE)
    // live-applicable edit (render/color) → true
    expect(hextrail.update!(state, parse({ glow: 0.2, branchiness: 0.5 }), SIZE)).toBe(true)
    // structural edit (hexSize) → false (framework re-runs setup)
    expect(hextrail.update!(state, parse({ hexSize: 40 }), SIZE)).toBeFalsy()
    expect(() => hextrail.resize!(state, { width: 640, height: 480 }, asCtx(ctx))).not.toThrow()
    expect(() => hextrail.frame(state, asCtx(ctx), 16, 16)).not.toThrow()
  })
})
