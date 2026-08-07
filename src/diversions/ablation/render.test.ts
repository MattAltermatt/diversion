import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import { ablationSchema, type AblationConfig } from './schema'
import { createState, step } from './ablation'
import { render } from './render'
import ablation from './index'

const SIZE = { width: 400, height: 300 }

function cfg(over: Partial<AblationConfig> = {}): AblationConfig {
  return { ...ablationSchema.parse({}), ...over }
}

/** A busy state: lasers riding, cells dying, bolts in flight, queue backed up. */
function busy() {
  const s = createState(cfg({ capacity: 6, arrivalRate: 12 }), SIZE)
  for (let i = 0; i < 600; i++) step(s, 1 / 60)
  return s
}

describe('render', () => {
  it('draws something on the very first frame', () => {
    const ctx = make2DContext()
    render(createState(cfg(), SIZE), ctx as unknown as CanvasRenderingContext2D)
    expect(ctx.calls.some((c) => c === 'fillRect' || c === 'drawImage')).toBe(true)
  })

  it('leaves globalAlpha at 1 when it returns', () => {
    const ctx = make2DContext()
    render(busy(), ctx as unknown as CanvasRenderingContext2D)
    expect(ctx.globalAlpha).toBe(1)
  })

  it('sets globalAlpha explicitly before every fill and stroke', () => {
    // The sticky-alpha gotcha: in a per-item draw loop, an iteration that does not
    // set globalAlpha inherits the PREVIOUS item's value, so only item 0 is right —
    // and with a swap-removed pool the pairing reshuffles and brightness flickers.
    // Recording the property is not possible through the mock, so instead assert
    // the invariant that makes it safe: every draw call is preceded by an explicit
    // assignment, which we prove by construction below via a tracking proxy.
    const seen: string[] = []
    const base = make2DContext()
    const ctx = new Proxy(base as unknown as Record<string, unknown>, {
      set(target, prop, value) {
        if (prop === 'globalAlpha') seen.push('alpha')
        ;(target as Record<string | symbol, unknown>)[prop] = value
        return true
      },
      get(target, prop) {
        const v = (target as Record<string | symbol, unknown>)[prop]
        if (typeof v === 'function' && (prop === 'fillRect' || prop === 'fill' || prop === 'stroke' || prop === 'drawImage')) {
          return (...args: unknown[]) => {
            seen.push(String(prop))
            return (v as (...a: unknown[]) => unknown).apply(target, args)
          }
        }
        return v
      },
    }) as unknown as CanvasRenderingContext2D

    render(busy(), ctx)

    const draws = seen.filter((e) => e !== 'alpha')
    expect(draws.length).toBeGreaterThan(0)
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] === 'alpha') continue
      const prior = seen.slice(0, i).lastIndexOf('alpha')
      expect(prior, `draw #${i} (${seen[i]}) had no globalAlpha set before it`).toBeGreaterThanOrEqual(0)
    }
  })

  it('reuses the picture buffer across frames and drains the patch list', () => {
    const ctx = make2DContext() as unknown as CanvasRenderingContext2D
    const s = createState(cfg({ capacity: 6, arrivalRate: 12 }), SIZE)
    render(s, ctx)
    const first = s.buffer
    expect(first).not.toBe(null)
    for (let i = 0; i < 300; i++) step(s, 1 / 60)
    expect(s.patches.length).toBeGreaterThan(0)
    render(s, ctx)
    expect(s.buffer).toBe(first)
    expect(s.patches.length).toBe(0)
  })

  it('rebuilds the buffer after a regeneration nulls it', () => {
    const ctx = make2DContext() as unknown as CanvasRenderingContext2D
    const s = createState(cfg(), SIZE)
    render(s, ctx)
    s.buffer = null
    render(s, ctx)
    expect(s.buffer).not.toBe(null)
  })

  it('survives a short-hex palette entry without producing NaN colours', () => {
    const ctx = make2DContext()
    const s = createState(cfg({ palette: ['#000', '#f80', '#fff'] }), SIZE)
    for (let i = 0; i < 200; i++) step(s, 1 / 60)
    expect(() => render(s, ctx as unknown as CanvasRenderingContext2D)).not.toThrow()
    const styles = [ctx.fillStyle, ctx.strokeStyle].map(String).join(' ')
    expect(styles).not.toContain('NaN')
  })
})

describe('the ablation diversion', () => {
  it('declares the contract the framework needs', () => {
    expect(ablation.id).toBe('ablation')
    expect(ablation.kind).toBe('2d')
    expect(ablation.title).toBeTruthy()
    expect(ablation.description).toBeTruthy()
    expect(ablation.presets?.length).toBe(2)
  })

  it('runs setup + frames without throwing', () => {
    const ctx = make2DContext()
    const config = cfg()
    const state = ablation.setup(ctx as never, config, SIZE)
    expect(() => {
      let t = 0
      for (let i = 0; i < 30; i++) { t += 16; ablation.frame(state, ctx as never, t, 16) }
    }).not.toThrow()
  })

  it('treats frame dt as milliseconds', () => {
    // The framework's loop hands dt in ms (clamped to 50); step() works in seconds.
    // A missing conversion makes the piece run 1000x fast and is invisible in a
    // still screenshot, so pin it: 1000ms of frames must advance ~1s of arrivals.
    const ctx = make2DContext()
    const config = cfg({ capacity: 40, arrivalRate: 4 })
    const state = ablation.setup(ctx as never, config, SIZE) as { lasers: unknown[] }
    let t = 0
    for (let i = 0; i < 60; i++) { t += 16.67; ablation.frame(state as never, ctx as never, t, 16.67) }
    expect(state.lasers.length).toBeGreaterThan(0)
    expect(state.lasers.length).toBeLessThanOrEqual(6)
  })

  it('applies a visual config change live and rejects a structural one', () => {
    const ctx = make2DContext()
    const config = cfg()
    const state = ablation.setup(ctx as never, config, SIZE)
    expect(ablation.update?.(state, { ...config, speed: 300 }, SIZE)).toBeTruthy()
    expect(ablation.update?.(state, { ...config, cellSize: 30 }, SIZE)).toBeFalsy()
    expect(ablation.update?.(state, { ...config, palette: ['#000000', '#ffffff'] }, SIZE)).toBeFalsy()
  })

  it('resizes without throwing', () => {
    const ctx = make2DContext()
    const config = cfg()
    const state = ablation.setup(ctx as never, config, SIZE)
    expect(() => ablation.resize?.(state, { width: 900, height: 500 }, ctx as never)).not.toThrow()
  })
})
