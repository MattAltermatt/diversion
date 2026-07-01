import { describe, it, expect } from 'vitest'
import { createSim, stepSim, type SimConfig } from './sim'
import { drawScene, buildSprites, type GlowSprites } from './render'
import { particleLifeSchema } from './schema'

const simCfg: SimConfig = {
  count: 120, colors: 5, seed: 7, rMax: 80, beta: 0.3,
  forceScale: 1, friction: 0.04, symmetry: 'Asymmetric', attractBias: 0.1,
}

function stubCtx() {
  const calls: string[] = []
  const rec = (name: string) => (..._args: any[]) => { calls.push(name) }
  return {
    calls,
    ctx: new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'canvas') return { width: 800, height: 450 }
        if (['fillStyle', 'globalAlpha', 'globalCompositeOperation'].includes(prop)) return ''
        return rec(prop)
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D,
  }
}

// jsdom has no real 2D context, so drawImage takes any object — fake canvases suffice.
const fakeSprites = (n: number, glow: boolean): GlowSprites => ({
  cores: Array.from({ length: n }, () => ({}) as HTMLCanvasElement),
  halos: glow ? Array.from({ length: n }, () => ({}) as HTMLCanvasElement) : [],
  coreHalf: 4,
  haloHalf: 8,
  glow,
})

describe('render', () => {
  it('buildSprites returns a core (and, with glow, a halo) per species color', () => {
    const spr = buildSprites(['#ff0000', '#00ff00', '#0000ff'], 2.5, true)
    expect(spr.cores.length).toBe(3)
    expect(spr.halos.length).toBe(3)
    expect(spr.coreHalf).toBeGreaterThan(0)
    const noGlow = buildSprites(['#ff0000', '#00ff00'], 2.5, false)
    expect(noGlow.cores.length).toBe(2)
    expect(noGlow.halos.length).toBe(0)
  })

  it('glow on: draws a halo + core per particle (two layers) and fades the field', () => {
    const s = createSim(simCfg)
    for (let i = 0; i < 20; i++) stepSim(s)
    const { ctx, calls } = stubCtx()
    const cfg = particleLifeSchema.parse({})
    expect(() => drawScene(ctx, s, cfg, { width: 800, height: 450 }, fakeSprites(cfg.colors, true))).not.toThrow()
    expect(calls.includes('fillRect')).toBe(true)
    expect(calls.filter((c) => c === 'drawImage').length).toBe(s.n * 2)
  })

  it('glow off: draws only opaque cores (one per particle)', () => {
    const s = createSim(simCfg)
    const { ctx, calls } = stubCtx()
    const cfg = particleLifeSchema.parse({ glow: false })
    drawScene(ctx, s, cfg, { width: 800, height: 450 }, fakeSprites(cfg.colors, false))
    expect(calls.filter((c) => c === 'drawImage').length).toBe(s.n)
  })
})
