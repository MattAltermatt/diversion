import { describe, it, expect } from 'vitest'
import { createSim, stepSim, DEFAULT_SIM_CONFIG } from './sim'
import { drawScene } from './render'
import { flockVsHunterSchema } from './schema'

function stubCtx() {
  const calls: string[] = []
  const rec = (name: string) => (..._args: any[]) => { calls.push(name) }
  return {
    calls,
    ctx: new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'canvas') return { width: 800, height: 450 }
        if (['fillStyle', 'strokeStyle', 'globalAlpha', 'font', 'lineWidth', 'textAlign'].includes(prop)) return ''
        return rec(prop)
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D,
  }
}

describe('render', () => {
  it('draws without throwing and paints boids', () => {
    const s = createSim({ ...DEFAULT_SIM_CONFIG, boidCount: 50, predatorCount: 2 })
    for (let i = 0; i < 30; i++) stepSim(s)
    const { ctx, calls } = stubCtx()
    const cfg = flockVsHunterSchema.parse({})
    expect(() => drawScene(ctx, s, cfg, { width: 800, height: 450 })).not.toThrow()
    expect(calls.filter(c => c === 'fill' || c === 'fillRect').length).toBeGreaterThan(0)
  })

  it('skips the HUD when showHud is false', () => {
    const s = createSim({ ...DEFAULT_SIM_CONFIG, boidCount: 50, predatorCount: 2 })
    const { ctx, calls } = stubCtx()
    const cfg = flockVsHunterSchema.parse({ showHud: false })
    drawScene(ctx, s, cfg, { width: 800, height: 450 })
    expect(calls.includes('fillText')).toBe(false)
  })
})
