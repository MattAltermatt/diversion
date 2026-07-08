// Port of Don Marti's xscreensaver hack `cloudlife` (hacks/cloudlife.c, part of
// xscreensaver by Jamie Zawinski, https://www.jwz.org/xscreensaver/). Clean-room
// TypeScript reimplementation from the real source — not a guess at the rule name.
//
// The rule is standard Conway Life (B3/S23) with one change: a cell's CONTRIBUTION
// to its neighbours' head-count depends on its age. `cell_value()` in the original:
//   dead cell        → 0
//   age > max_age     → 3   (an "aged-out" cell counts TRIPLE)
//   otherwise (alive) → 1
// A dead cell is born when the summed contribution of its 8 neighbours is exactly 3
// (so a single aged-out neighbour alone can trigger a birth); a live cell survives
// when the sum is 2 or 3, else dies. A surviving cell's age increments by 1. Because
// an old cell suddenly "weighs" 3, dense long-lived clumps push their neighbourhood
// into overpopulation and explode instead of freezing into a still life — this is
// the whole "cloudlife" idea: the field never fully stabilizes.
//
// Two deliberate departures from the original, both about adapting an X11 hack
// (drawn into a windowed off-screen-bordered field) to a full-bleed animated canvas:
//   1. Neighbour counting wraps toroidally (matches this gallery's other grid-CA
//      diversions, e.g. game-of-life) instead of the original's static off-screen
//      border + periodic "populate edges, tick, clear edges" injection pulse — a
//      full-bleed canvas has no true off-screen slack to inject entropy from.
//   2. Reseed-on-quiescence uses this project's absolute changed-cell-count
//      threshold (see QUIET_RESEED) rather than the source's population/(w+h)
//      ratio — the established convention across this gallery's CAs.
//
// Age drives COLOR (the headline visual upgrade over the original, which only did
// global colormap cycling): a cell is tinted along `palette` from young (bottom)
// to old (top), clamped at `maxAge` — so the ramp visually telegraphs which clumps
// are closest to exploding.

import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'
import { parseHex6, type RGBA } from '../../framework/color'
import type { CloudLifeConfig } from './schema'

// Reseed once the board has been near-still this many generations, or after this
// many generations regardless (an oscillator-locked board never fully stills) —
// mirrors game-of-life's convention: an ABSOLUTE changed-cell threshold, not one
// scaled to grid size.
const QUIET_THRESHOLD = 4
const QUIET_RESEED = 90
const MAX_GENS = 1400

// Age storage ceiling — well above any usable `maxAge` (capped at 200 by the
// schema), just to keep the Uint16 count from free-running forever.
const AGE_STORE_CAP = 4000

// Resolution of the precomputed young→old colour ramp.
const LUT_STEPS = 255

type RGB = [number, number, number]

export type CloudLifeState = {
  cfg: CloudLifeConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  alive: Uint8Array
  next: Uint8Array
  age: Uint16Array
  nextAge: Uint16Array
  ageLUT: Uint8ClampedArray // (LUT_STEPS + 1) × RGB, young (index 0) → old (index LUT_STEPS)
  bg: RGB
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  stepAcc: number
  quietGens: number
  gens: number
  reseeds: number
  needBlit: boolean
}

/** A live cell's contribution to a neighbour's head-count: 0 dead, 3 aged-out
 *  (age > maxAge — the "explode" weighting), 1 otherwise. Exported for tests. */
export function cellValue(aliveFlag: number, age: number, maxAge: number): number {
  if (!aliveFlag) return 0
  return age > maxAge ? 3 : 1
}

function toRGB(hex6: string): RGB {
  const c = parseHex6(hex6)
  return [c.r, c.g, c.b]
}

function buildAgeLUT(palette: string[]): Uint8ClampedArray {
  const stops = palette.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Uint8ClampedArray((LUT_STEPS + 1) * 4)
  for (let i = 0; i <= LUT_STEPS; i++) {
    const t = i / LUT_STEPS
    const c: RGBA = sampleGradientRGBA(stops, t)
    const o = i * 4
    lut[o] = c.r; lut[o + 1] = c.g; lut[o + 2] = c.b; lut[o + 3] = 255
  }
  return lut
}

/** Rebuild the colour tables in place (a live palette/background edit — keeps
 *  the board). */
export function applyColors(st: CloudLifeState, palette: string[], background: string): void {
  st.ageLUT = buildAgeLUT(palette)
  st.bg = toRGB(background)
  st.needBlit = true
}

function seedBoard(st: CloudLifeState): void {
  const rng = mulberry32(st.cfg.seed + st.reseeds)
  const { alive, age, gw, gh, cfg } = st
  for (let i = 0; i < gw * gh; i++) {
    const a = rng() < cfg.initialDensity ? 1 : 0
    alive[i] = a
    age[i] = a // a freshly-born cell starts at age 1
  }
  st.quietGens = 0
  st.gens = 0
  st.needBlit = true
}

export function createCloudLifeState(cfg: CloudLifeConfig, w: number, h: number): CloudLifeState {
  const cell = cfg.cellSize
  const gw = Math.max(1, Math.ceil(w / cell))
  const gh = Math.max(1, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('CloudLife requires a 2D context for its offscreen buffer')
  const st: CloudLifeState = {
    cfg, w, h, gw, gh, cell,
    alive: new Uint8Array(gw * gh),
    next: new Uint8Array(gw * gh),
    age: new Uint16Array(gw * gh),
    nextAge: new Uint16Array(gw * gh),
    ageLUT: buildAgeLUT(cfg.palette),
    bg: toRGB(cfg.background),
    off, offCtx, img: offCtx.createImageData(gw, gh),
    stepAcc: 0, quietGens: 0, gens: 0, reseeds: 0, needBlit: true,
  }
  seedBoard(st)
  return st
}

/** Re-fit the board to a new display size. Reallocates + reseeds only when the
 *  cell grid actually changes dimensions (a full-bleed CA starts fresh on a real
 *  resize); a same-dimension resize just re-blits. */
export function resizeCloudLife(st: CloudLifeState, w: number, h: number): void {
  const gw = Math.max(1, Math.ceil(w / st.cell))
  const gh = Math.max(1, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) { st.needBlit = true; return }
  st.gw = gw
  st.gh = gh
  st.alive = new Uint8Array(gw * gh)
  st.next = new Uint8Array(gw * gh)
  st.age = new Uint16Array(gw * gh)
  st.nextAge = new Uint16Array(gw * gh)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedBoard(st)
}

/** One generation: toroidal neighbour head-count (age-weighted) → birth/survival
 *  + age increment, per the source rule described at the top of this file. */
export function generation(st: CloudLifeState): void {
  const { alive, next, age, nextAge, gw, gh, cfg } = st
  const maxAge = cfg.maxAge
  let changed = 0
  for (let y = 0; y < gh; y++) {
    const ym = ((y - 1 + gh) % gh) * gw
    const y0 = y * gw
    const yp = ((y + 1) % gh) * gw
    for (let x = 0; x < gw; x++) {
      const xm = (x - 1 + gw) % gw
      const xp = (x + 1) % gw
      const sum =
        cellValue(alive[ym + xm], age[ym + xm], maxAge) +
        cellValue(alive[ym + x], age[ym + x], maxAge) +
        cellValue(alive[ym + xp], age[ym + xp], maxAge) +
        cellValue(alive[y0 + xm], age[y0 + xm], maxAge) +
        cellValue(alive[y0 + xp], age[y0 + xp], maxAge) +
        cellValue(alive[yp + xm], age[yp + xm], maxAge) +
        cellValue(alive[yp + x], age[yp + x], maxAge) +
        cellValue(alive[yp + xp], age[yp + xp], maxAge)
      const i = y0 + x
      const a = alive[i]
      let nv: number
      let na: number
      if (a) {
        if (sum === 2 || sum === 3) {
          nv = 1
          na = age[i] < AGE_STORE_CAP ? age[i] + 1 : AGE_STORE_CAP
        } else {
          nv = 0
          na = 0
        }
      } else if (sum === 3) {
        nv = 1
        na = 1
      } else {
        nv = 0
        na = 0
      }
      next[i] = nv
      nextAge[i] = na
      if (nv !== a) changed++
    }
  }
  // swap: next becomes the current board
  st.alive = next
  st.next = alive
  st.age = nextAge
  st.nextAge = age
  st.gens++
  st.quietGens = changed <= QUIET_THRESHOLD ? st.quietGens + 1 : 0
  if (st.quietGens >= QUIET_RESEED || st.gens >= MAX_GENS) {
    st.reseeds++
    seedBoard(st)
  }
  st.needBlit = true
}

/** Paint the board into the offscreen buffer and blit it, scaled crisply. */
export function renderCloudLife(st: CloudLifeState, ctx: CanvasRenderingContext2D): void {
  const { img, alive, age, ageLUT, bg, gw, gh, cfg } = st
  const maxAge = cfg.maxAge
  const data = img.data
  for (let i = 0; i < gw * gh; i++) {
    const o = i * 4
    if (alive[i]) {
      const t = age[i] >= maxAge ? 1 : age[i] / maxAge
      const idx = (t * LUT_STEPS + 0.5) | 0
      const d = idx * 4
      data[o] = ageLUT[d]; data[o + 1] = ageLUT[d + 1]; data[o + 2] = ageLUT[d + 2]
    } else {
      data[o] = bg[0]; data[o + 1] = bg[1]; data[o + 2] = bg[2]
    }
    data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  st.needBlit = false
}
