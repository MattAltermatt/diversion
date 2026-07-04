import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'
import type { BriansBrainConfig } from './schema'

// ── Cell state values ──
// Index 0 is the background/quiescent state for BOTH rules, so the palette LUT's
// slot 0 is always the background colour and render() can key straight off `cur[i]`.
// Brian's Brain (3 states):
export const BB_OFF = 0
export const BB_ON = 1
export const BB_DYING = 2
// Wireworld (4 states):
export const WW_EMPTY = 0
export const WW_WIRE = 1
export const WW_HEAD = 2
export const WW_TAIL = 3

const HEAD_FRACTION = 0.05 // fraction of seeded wire that starts as an electron head

// Reseed lifecycle — an ABSOLUTE active-cell floor (per
// [[gotcha-ca-quiescence-absolute-threshold]]): a live field runs hundreds of
// active cells; a collapsed one runs ≤ a few. Never grid-proportional.
const LOW_THRESHOLD = 3 // ≤ this many active cells counts as "collapsed"
const QUIET_WINDOW = 40 // sustained collapsed steps → reseed
const MIN_STEPS = 30    // never reseed before this (let a fresh soup organize)
const MAX_STEPS = 2400  // periodic refresh even when perfectly lively (~3min at 14/s)

export type RGB = [number, number, number]

export interface BrainState {
  cfg: BriansBrainConfig
  w: number; h: number
  gw: number; gh: number
  cell: number
  brains: boolean          // cached rule discriminator
  cur: Uint8Array
  next: Uint8Array
  lut: RGB[]               // colour per state value (slot 0 = background)
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  acc: number              // fractional-step accumulator (frame-rate independence)
  step: number             // steps since the last (re)seed
  quiet: number            // consecutive collapsed steps
  active: number           // active cells after the last step (ON, or HEAD+TAIL)
  reseeds: number
  needBlit: boolean
}

const isBrains = (rule: string) => rule === "Brian's Brain"

function rgb(hex: string): RGB {
  const c = parseHex6(hex)
  return [c.r, c.g, c.b]
}

/** Palette LUT — colour per state value. Slot 0 is always the background. */
export function buildLut(cfg: BriansBrainConfig): RGB[] {
  const bg = rgb(cfg.background)
  return isBrains(cfg.rule)
    ? [bg, rgb(cfg.onColor), rgb(cfg.dyingColor)]
    : [bg, rgb(cfg.wireColor), rgb(cfg.headColor), rgb(cfg.tailColor)]
}

/** Count the active cells (the reseed metric): ON for Brian's Brain, the live
 *  electrons (HEAD + TAIL) for Wireworld. */
function countActive(cur: Uint8Array, brains: boolean): number {
  let n = 0
  if (brains) {
    for (let i = 0; i < cur.length; i++) if (cur[i] === BB_ON) n++
  } else {
    for (let i = 0; i < cur.length; i++) if (cur[i] === WW_HEAD || cur[i] === WW_TAIL) n++
  }
  return n
}

/** Fill the grid with a fresh seeded field. Deterministic in (seed, reseeds). */
export function seedBoard(st: BrainState): void {
  const rng = mulberry32(((st.cfg.seed >>> 0) + st.reseeds) >>> 0)
  const { cur, brains } = st
  if (brains) {
    const d = st.cfg.density
    for (let i = 0; i < cur.length; i++) cur[i] = rng() < d ? BB_ON : BB_OFF
  } else {
    const wd = st.cfg.wireDensity
    for (let i = 0; i < cur.length; i++) {
      if (rng() < wd) cur[i] = rng() < HEAD_FRACTION ? WW_HEAD : WW_WIRE
      else cur[i] = WW_EMPTY
    }
  }
  st.step = 0
  st.quiet = 0
  st.active = countActive(cur, brains)
  st.needBlit = true
}

export function createBrainState(cfg: BriansBrainConfig, w: number, h: number): BrainState {
  const cell = cfg.cellSize
  const gw = Math.max(1, Math.ceil(w / cell))
  const gh = Math.max(1, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Brian’s Brain requires a 2D context for its offscreen buffer')
  const st: BrainState = {
    cfg, w, h, gw, gh, cell,
    brains: isBrains(cfg.rule),
    cur: new Uint8Array(gw * gh),
    next: new Uint8Array(gw * gh),
    lut: buildLut(cfg),
    off, offCtx, img: offCtx.createImageData(gw, gh),
    acc: 0, step: 0, quiet: 0, active: 0, reseeds: 0, needBlit: true,
  }
  seedBoard(st)
  return st
}

/** Re-fit to a new display size. Reallocates + reseeds only when the cell grid
 *  actually changes dimensions (a CA fills the screen, so — like Life/demon — a
 *  genuine resize starts a fresh field); a same-dimension resize just re-blits. */
export function resizeBrain(st: BrainState, w: number, h: number): void {
  const gw = Math.max(1, Math.ceil(w / st.cell))
  const gh = Math.max(1, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) { st.needBlit = true; return }
  st.gw = gw
  st.gh = gh
  st.cur = new Uint8Array(gw * gh)
  st.next = new Uint8Array(gw * gh)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedBoard(st)
}

/** One synchronous CA generation. Toroidal 8-neighbour (Moore). Reseeds in place
 *  when the field has collapsed to the absolute floor for a window, or after a
 *  long lively run — so the screen is never permanently dead OR permanently the
 *  same. */
export function stepBrain(st: BrainState): void {
  const { cur, next, gw, gh, brains } = st
  for (let y = 0; y < gh; y++) {
    const ym = ((y - 1 + gh) % gh) * gw
    const y0 = y * gw
    const yp = ((y + 1) % gh) * gw
    for (let x = 0; x < gw; x++) {
      const xm = (x - 1 + gw) % gw
      const xp = (x + 1) % gw
      const i = y0 + x
      const c = cur[i]
      if (brains) {
        if (c === BB_ON) { next[i] = BB_DYING }
        else if (c === BB_DYING) { next[i] = BB_OFF }
        else {
          // OFF → ON iff exactly 2 of the 8 neighbours are ON.
          const n = (cur[ym + xm] === BB_ON ? 1 : 0) + (cur[ym + x] === BB_ON ? 1 : 0)
                  + (cur[ym + xp] === BB_ON ? 1 : 0) + (cur[y0 + xm] === BB_ON ? 1 : 0)
                  + (cur[y0 + xp] === BB_ON ? 1 : 0) + (cur[yp + xm] === BB_ON ? 1 : 0)
                  + (cur[yp + x] === BB_ON ? 1 : 0) + (cur[yp + xp] === BB_ON ? 1 : 0)
          next[i] = n === 2 ? BB_ON : BB_OFF
        }
      } else {
        if (c === WW_EMPTY) { next[i] = WW_EMPTY }
        else if (c === WW_HEAD) { next[i] = WW_TAIL }
        else if (c === WW_TAIL) { next[i] = WW_WIRE }
        else {
          // WIRE → HEAD iff 1 or 2 of the 8 neighbours are electron heads.
          const n = (cur[ym + xm] === WW_HEAD ? 1 : 0) + (cur[ym + x] === WW_HEAD ? 1 : 0)
                  + (cur[ym + xp] === WW_HEAD ? 1 : 0) + (cur[y0 + xm] === WW_HEAD ? 1 : 0)
                  + (cur[y0 + xp] === WW_HEAD ? 1 : 0) + (cur[yp + xm] === WW_HEAD ? 1 : 0)
                  + (cur[yp + x] === WW_HEAD ? 1 : 0) + (cur[yp + xp] === WW_HEAD ? 1 : 0)
          next[i] = (n === 1 || n === 2) ? WW_HEAD : WW_WIRE
        }
      }
    }
  }
  // swap buffers
  st.cur = next
  st.next = cur
  st.step++
  st.active = countActive(st.cur, brains)
  if (st.active <= LOW_THRESHOLD) st.quiet++
  else st.quiet = 0
  if ((st.step >= MIN_STEPS && st.quiet >= QUIET_WINDOW) || st.step >= MAX_STEPS) {
    st.reseeds++
    seedBoard(st)
  }
  st.needBlit = true
}

/** Paint the whole grid into the offscreen buffer and blit it, scaled crisply
 *  (nearest-neighbour). Called only when `needBlit`. */
export function renderBrain(st: BrainState, ctx: CanvasRenderingContext2D): void {
  const { img, cur, lut, gw, gh } = st
  const data = img.data
  for (let i = 0; i < cur.length; i++) {
    const c = lut[cur[i]]
    const o = i * 4
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  st.needBlit = false
}

/** Live-apply a config change. Colour + speed edits keep the field; a rule,
 *  cell-size, seed, or density change is structural → return false for a full
 *  teardown + setup. */
export function updateBrain(st: BrainState, cfg: BriansBrainConfig): boolean {
  if (cfg.rule !== st.cfg.rule) return false
  if (cfg.cellSize !== st.cfg.cellSize) return false
  if (cfg.seed !== st.cfg.seed) return false
  if (cfg.density !== st.cfg.density) return false
  if (cfg.wireDensity !== st.cfg.wireDensity) return false
  // Only speed / palette changed — apply live, keep the field.
  st.cfg = cfg
  st.lut = buildLut(cfg)
  st.needBlit = true
  return true
}
