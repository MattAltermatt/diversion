import { describe, expect, it } from 'vitest'
import { make2DContext } from '../../test-setup'
import { DEFAULTS } from './config'
import { createFleet, step } from './sim'
import { launch } from './projectiles'
import { WEAPONS } from './weapons'
import { render } from './render'

const SIZE = { width: 400, height: 300 }
const busy = (seed: number, seconds = 60) => {
  const s = createFleet({ ...DEFAULTS, seed }, SIZE)
  for (let i = 0; i < seconds * 10; i++) step(s, 0.1)
  return s
}

/**
 * Record the alpha in force at every hull FILL, keyed by its fill colour.
 *
 * This is the shape of the real defect: a per-item loop where some draws set
 * `globalAlpha` and others rely on it, so item N inherits item N-1's value.
 * Only item 0 is right, and because pool membership reshuffles as ships sink,
 * the brightness FLICKERS.
 */
function watchHullFills(ctx: ReturnType<typeof make2DContext>): number[] {
  const alphas: number[] = []
  let alpha = 1
  let style = ''
  Object.defineProperty(ctx, 'globalAlpha', {
    configurable: true, get: () => alpha, set: (v: number) => { alpha = v },
  })
  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true, get: () => style, set: (v: string) => { style = v },
  })
  const orig = ctx.fill.bind(ctx)
  ;(ctx as unknown as Record<string, unknown>).fill = (...a: unknown[]) => {
    // Faction colours only — skip the black turret and white splash fills.
    if (style.startsWith('hsl') || /^#(?!fff|000|1c2)/.test(style)) alphas.push(alpha)
    return (orig as (...x: unknown[]) => unknown)(...a)
  }
  return alphas
}

describe('render', () => {
  it('draws onto the handed-in context', () => {
    const ctx = make2DContext()
    render(createFleet(DEFAULTS, SIZE), ctx)
    expect(ctx.calls.some((c) => ['fillRect', 'fill', 'stroke'].includes(c))).toBe(true)
  })

  it('survives a frame with tracers, beams and splashes in flight', () => {
    const ctx = make2DContext()
    const s = busy(4)
    expect(s.shells.length + s.splashes.length + s.flashes.length).toBeGreaterThan(0)
    expect(() => render(s, ctx)).not.toThrow()
  }, 30_000)

  // ⚠️ Two wrong versions of this test were caught in review. `Number.isFinite`
  // cannot fail, because a leaked alpha is a finite number. And asserting
  // "more than one distinct alpha was seen" FAILS on correct code whenever a
  // frame happens to contain only one kind of primitive.
  //
  // The invariant that holds: every hull is painted at full opacity, whatever
  // its neighbours' damage. Give the fleet a spread of HP — which drives the
  // varying HP-bar alphas that a leak would propagate — and the hull fills
  // must still be uniform.
  it('every hull paints at the same alpha, whatever its neighbours damage', () => {
    const ctx = make2DContext()
    const s = createFleet(DEFAULTS, SIZE)
    s.ships.forEach((sh, i) => { sh.hp = sh.spec.hp * (0.15 + 0.14 * i) })
    const alphas = watchHullFills(ctx)
    render(s, ctx)
    expect(alphas.length).toBe(s.ships.length)
    expect(new Set(alphas.map((a) => a.toFixed(4))).size,
      `hull alphas varied: ${alphas.join(', ')}`).toBe(1)
    expect(alphas[0]).toBe(1)
  })

  it('leaves the context clean for whatever draws next', () => {
    const ctx = make2DContext()
    render(busy(6), ctx)
    expect(ctx.globalAlpha).toBe(1)
  }, 30_000)

  it('costs less when wakes are off', () => {
    const a = make2DContext()
    const b = make2DContext()
    const s = busy(2, 30)
    render(s, a)
    s.cfg = { ...s.cfg, showWakes: false }
    render(s, b)
    expect(b.calls.length).toBeLessThan(a.calls.length)
  }, 30_000)

  // ⚠️ At gallery-tile scale a hull is ~10 px, and the condition bar used to
  // carry a `Math.max(18, …)` floor — a bar 1.7x the boat's own length, on a
  // black plate, in colours byte-identical to two faction colours. The bars
  // were the loudest thing on the card and carried no faction information.
  it('draws no condition bar at gallery-tile scale', () => {
    const seen: string[] = []
    const watch = (ctx: ReturnType<typeof make2DContext>): void => {
      let style = ''
      Object.defineProperty(ctx, 'fillStyle', {
        configurable: true, get: () => style, set: (v: string) => { style = v },
      })
      const orig = ctx.fillRect.bind(ctx)
      ;(ctx as unknown as Record<string, unknown>).fillRect = (...a: unknown[]) => {
        seen.push(style)
        return (orig as (...x: unknown[]) => unknown)(...a)
      }
    }
    const tile = make2DContext()
    watch(tile)
    const s = createFleet(DEFAULTS, { width: 335, height: 210 })
    for (const sh of s.ships) sh.hp = sh.spec.hp * 0.4   // every hull damaged
    render(s, tile)
    expect(seen).not.toContain('#04141f')

    // ...and it DOES draw at play-screen scale, so the guard is a scale test
    // and not a deletion.
    seen.length = 0
    const play = make2DContext()
    watch(play)
    const big = createFleet(DEFAULTS, { width: 1600, height: 900 })
    for (const sh of big.ships) sh.hp = sh.spec.hp * 0.4
    render(big, play)
    expect(seen).toContain('#04141f')
  })

    it('letterboxes rather than stretching a non-16:9 canvas', () => {
    const ctx = make2DContext()
    const s = createFleet(DEFAULTS, { width: 400, height: 400 })
    // ⚠️ `calls[0] === 'fillRect'` cannot see a missing letterbox — the pool
    // fill is also a fillRect. Watch the COLOUR of the first one.
    const fills: string[] = []
    let style = ''
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true, get: () => style, set: (v: string) => { style = v },
    })
    const orig = ctx.fillRect.bind(ctx)
    ;(ctx as unknown as Record<string, unknown>).fillRect = (...a: unknown[]) => {
      fills.push(style)
      return (orig as (...x: unknown[]) => unknown)(...a)
    }
    render(s, ctx)
    expect(s.offsetY).toBeGreaterThan(0)
    expect(fills[0], 'the letterbox must be painted before the pool').toBe('#08131b')
    expect(fills[1]).toBe(DEFAULTS.background)
  })

  // ⚠️ A differential on paint COUNT is too loose — deleting the streak still
  // leaves the head dot, and both mutants survived it. Assert each munition's
  // actual signature: fast shot is a gradient streak, slow ordnance is a
  // drawn body in its own colour.
  it('paints each munition in its own idiom', () => {
    const styles = (ctx: ReturnType<typeof make2DContext>): string[] => {
      const seen: string[] = []
      for (const k of ['fillStyle', 'strokeStyle'] as const) {
        let v: unknown = ''
        Object.defineProperty(ctx, k, {
          configurable: true, get: () => v, set: (x: unknown) => { v = x; seen.push(String(x)) },
        })
      }
      return seen
    }
    const frameWith = (kind: string): { calls: string[]; styles: string[] } => {
      const s2 = createFleet(DEFAULTS, SIZE)
      const a = s2.ships[0]!
      const b = s2.ships[1]!
      a.weapon = WEAPONS[kind as keyof typeof WEAPONS]
      b.hull.x = a.hull.x + 0.4
      b.hull.y = a.hull.y
      launch(s2, a, b, a.weapon)
      for (const sh of s2.shells) { sh.x += 0.12; sh.y += 0.04 }
      const ctx = make2DContext()
      const st = styles(ctx)
      render(s2, ctx)
      return { calls: ctx.calls, styles: st }
    }

    for (const kind of ['cannon', 'railgun', 'flak']) {
      expect(frameWith(kind).calls, kind).toContain('createLinearGradient')
    }
    for (const [kind, colour] of [
      ['torpedo', '#20303c'], ['depthCharge', '#2b2f33'], ['mortar', '#3a4550'],
    ] as const) {
      const f = frameWith(kind)
      expect(f.styles, `${kind} body`).toContain(colour)
      expect(f.calls, `${kind} must not be drawn as a tracer`).not.toContain('createLinearGradient')
    }
  })

  it('paints every round in flight — streaks for shot, bodies for ordnance', () => {
    const ctx = make2DContext()
    // ⚠️ Step until a round is ACTUALLY in flight. A shell lives 1.9 rendered
    // frames, so an arbitrary frame usually has none and the test would assert
    // nothing.
    const s = createFleet({ ...DEFAULTS, seed: 4 }, SIZE)
    for (let i = 0; i < 40_000 && s.shells.length === 0; i++) step(s, 1 / 120)
    expect(s.shells.length).toBeGreaterThan(0)
    render(s, ctx)
    const paints = (c: string[]): number => c.filter((x) => x === 'stroke' || x === 'fill').length
    const withShells = paints(ctx.calls)

    // ⚠️ Differential, not `calls.toContain('createLinearGradient')` — the
    // gradient is built BEFORE the stroke, so it survives deleting the streak.
    // Compare against the identical frame with the rounds removed.
    const bare = make2DContext()
    const held = s.shells
    s.shells = []
    render(s, bare)
    s.shells = held
    const withoutShells = paints(bare.calls)
    // Every round in flight must add at least one paint — a streak for the
    // fast rounds, a drawn body for the slow ordnance.
    expect(withShells, 'each round in flight must be painted')
      .toBeGreaterThanOrEqual(withoutShells + s.shells.length)
  }, 30_000)
})
