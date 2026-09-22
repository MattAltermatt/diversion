import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './config'
import { factionColor, factionDark, hueFor, lightnessOf } from './palette'
import { poolNavyPresets } from './presets'

const P = DEFAULTS.palette
const BG = DEFAULTS.background

describe('faction colours', () => {
  it('is deterministic and never runs out', () => {
    expect(factionColor(7, P, BG)).toBe(factionColor(7, P, BG))
    for (let i = 0; i < 500; i++) expect(factionColor(i, P, BG)).toMatch(/^(#|hsl)/)
  })

  // The configured palette is honoured in HUE and SATURATION, and returned
  // verbatim when it already clears the water — but it is NOT exempt from the
  // clearance solve. Exempting it quietly excluded the two OPENING SIDES, i.e.
  // the landing view, from the one guarantee this module exists for.
  it('honours a configured colour that already clears the water', () => {
    const clears = P[2]!  // #54d98c, gap 0.222 against the default ground
    expect(factionColor(2, P, BG)).toBe(clears)
  })

  it('keeps a configured hue but lifts its lightness when it would vanish', () => {
    const before = P[0]!  // #e5534b, gap 0.067 — well under the requirement
    const after = factionColor(0, P, BG)
    expect(after).not.toBe(before)
    const hueOf = (css: string): number => Number(/hsl\(([\d.]+)/.exec(css)![1])
    expect(hueOf(after), 'the viewer chose this hue').toBeCloseTo(3.1, 0)
    expect(Math.abs(lightnessOf(after) - lightnessOf(BG))).toBeGreaterThanOrEqual(0.18)
  })

  // ⚠️ Starts at 0, not at P.length. The old sweeps began past the named
  // factions, so the bypass was invisible to every test in this file.
  it('EVERY faction clears the water, configured or generated', () => {
    for (const bg of [BG, '#2ec4b6', '#eef4f8', '#08131b']) {
      for (let i = 0; i < 200; i++) {
        const gap = Math.abs(lightnessOf(factionColor(i, P, bg)) - lightnessOf(bg))
        expect(gap, `faction ${i} on ${bg}`).toBeGreaterThanOrEqual(0.18)
      }
    }
  })

  // Consecutive arrivals are what a viewer compares, so they must be far
  // apart on the wheel — that is the whole reason for the golden angle.
  it('consecutive generated hues are far apart', () => {
    for (let i = P.length; i < 300; i++) {
      const d = Math.abs(hueFor(i) - hueFor(i + 1))
      expect(Math.min(d, 360 - d), `factions ${i}/${i + 1}`).toBeGreaterThan(90)
    }
  })

  // ⚠️ Measured, not authored: worst-case perceptual lightness gap between a
  // generated faction and the water, over 500 factions. Without the water-hue
  // lift the worst case drops below 0.14.
  it('no generated faction sinks into the water', () => {
    let worst = 1
    const water = lightnessOf(BG)
    for (let i = P.length; i < 500; i++) {
      worst = Math.min(worst, Math.abs(lightnessOf(factionColor(i, P, BG)) - water))
    }
    expect(worst).toBeGreaterThanOrEqual(0.18)
  })

  // ⚠️ The solve only fires when the base colour actually COLLIDES with the
  // ground, so a test using two grounds far from the base lightness proves
  // nothing — both come back untouched and identical. These two collide.
  it('the solve responds to the GROUND, not to a baked-in hue', () => {
    const near = '#5d7f8e'  // mid, close to the base lightness
    const alsoNear = '#8fa6ad' // also colliding, but lighter
    const a = factionColor(41, P, near)
    const b = factionColor(41, P, alsoNear)
    expect(a).not.toBe(b)
    expect(Math.abs(lightnessOf(a) - lightnessOf(near))).toBeGreaterThanOrEqual(0.18)
    expect(Math.abs(lightnessOf(b) - lightnessOf(alsoNear))).toBeGreaterThanOrEqual(0.18)
  })

  it('clears the ground on a LIGHT pool as well as a dark one', () => {
    for (const bg of ['#eef4f8', '#08131b', '#5d7f8e', '#b8741f']) {
      let worst = 1
      for (let i = P.length; i < 200; i++) {
        worst = Math.min(worst, Math.abs(lightnessOf(factionColor(i, P, bg)) - lightnessOf(bg)))
      }
      expect(worst, `ground ${bg}`).toBeGreaterThanOrEqual(0.18)
    }
  })

  it('hue is stable when the sequence is regenerated', () => {
    expect(hueFor(100)).toBeCloseTo(hueFor(100), 10)
    expect(hueFor(0)).toBeGreaterThanOrEqual(0)
    expect(hueFor(999)).toBeLessThan(360)
  })

  // ⚠️ Darkness alone is not the contract. With the hex hue reader broken,
  // every named faction got a dark RED outline — a blue hull with a red
  // outline — and the darkness test above stayed green.
  it('the outline carries the HULL OWN hue, not a default', () => {
    const hueOf = (css: string): number => Number(/hsl\(([\d.]+)/.exec(css)![1])
    // #4a9df0 is blue (~208 deg); a broken reader yields 0 (red).
    expect(hueOf(factionDark(1, P, BG))).toBeGreaterThan(180)
    expect(hueOf(factionDark(1, P, BG))).toBeLessThan(240)
    // #54d98c is green (~146 deg).
    expect(hueOf(factionDark(2, P, BG))).toBeGreaterThan(120)
    expect(hueOf(factionDark(2, P, BG))).toBeLessThan(170)
  })

  // ⚠️ Sweeps every shipped PRESET against every ground, not just DEFAULTS.
  // A fixed-lightness outline came out LIGHTER than the hull on `Chlorine`
  // (hull L 0.193, outline L 0.384) and the old DEFAULTS-only loop never saw
  // it — the preset is one click away in the config panel.
  it('the outline is darker than the hull, on every preset and every ground', () => {
    const palettes = [P, ...poolNavyPresets
      .flatMap((g) => g.options)
      .map((o) => (o.patch as { palette?: string[] }).palette)
      .filter((x): x is string[] => Array.isArray(x))]
    for (const bg of [BG, '#2ec4b6', '#0c2233', '#dfe8ec', '#08131b']) {
      for (const pal of palettes) {
        for (let i = 0; i < pal.length + 6; i++) {
          const hull = lightnessOf(factionColor(i, pal, bg))
          const dark = lightnessOf(factionDark(i, pal, bg))
          expect(dark, `faction ${i} of [${pal.join(',')}] on ${bg}`).toBeLessThan(hull)
        }
      }
    }
  })
})
