import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'
import type { GameOfLifeConfig } from './schema'

// Ages beyond this all read as "oldest" (caps the color ramp + the Uint16 range).
export const AGE_CAP = 24
// Reseed when the board has been near-still this many generations, or after this
// many generations regardless (oscillator-locked boards never fully still) — so it
// always refreshes into new chaos.
const QUIET_RESEED = 60
const MAX_GENS = 900

// Birth / survival neighbour-count sets per named rule.
export const RULE_TABLE: Record<string, { birth: number[]; survive: number[] }> = {
  Life: { birth: [3], survive: [2, 3] },
  HighLife: { birth: [3, 6], survive: [2, 3] },
  'Day/Night': { birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] },
  Maze: { birth: [3], survive: [1, 2, 3, 4, 5] },
  Coral: { birth: [3], survive: [4, 5, 6, 7, 8] },
}

/** Neighbour-count lookup: table[n] = 1 if a cell with n live neighbours is set. */
export function ruleMasks(rule: string): { birth: Uint8Array; survive: Uint8Array } {
  const r = RULE_TABLE[rule] ?? RULE_TABLE.Life
  const birth = new Uint8Array(9)
  const survive = new Uint8Array(9)
  for (const n of r.birth) birth[n] = 1
  for (const n of r.survive) survive[n] = 1
  return { birth, survive }
}

type RGB = [number, number, number]

export type LifeState = {
  cfg: GameOfLifeConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  alive: Uint8Array
  next: Uint8Array
  age: Uint16Array
  ghost: Uint8Array
  birth: Uint8Array
  survive: Uint8Array
  ageLUT: Uint8ClampedArray // (AGE_CAP+1) × RGBA
  bg: RGB
  ghostRGB: RGB
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  stepAcc: number
  quietGens: number
  gens: number
  reseeds: number
  needBlit: boolean
}

function toRGB(hex8: string[], t: number): RGB {
  const c = sampleGradientRGBA(hex8, t)
  return [Math.round(c.r), Math.round(c.g), Math.round(c.b)]
}

function buildColors(stops: string[]): { ageLUT: Uint8ClampedArray; bg: RGB; ghostRGB: RGB } {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const ageLUT = new Uint8ClampedArray((AGE_CAP + 1) * 4)
  for (let a = 0; a <= AGE_CAP; a++) {
    // youngest (a=1) starts 30% into the ramp, oldest reaches the top.
    const t = 0.3 + 0.7 * (Math.max(1, a) - 1) / (AGE_CAP - 1)
    const c = toRGB(s8, t)
    ageLUT[a * 4] = c[0]; ageLUT[a * 4 + 1] = c[1]; ageLUT[a * 4 + 2] = c[2]; ageLUT[a * 4 + 3] = 255
  }
  return { ageLUT, bg: toRGB(s8, 0), ghostRGB: toRGB(s8, 0.5) }
}

/** Rebuild the color tables in place (a live palette edit — keeps the board). */
export function applyColors(st: LifeState, stops: string[]): void {
  const { ageLUT, bg, ghostRGB } = buildColors(stops)
  st.ageLUT = ageLUT
  st.bg = bg
  st.ghostRGB = ghostRGB
  st.needBlit = true
}

function seedBoard(st: LifeState): void {
  const rng = mulberry32(st.cfg.seed + st.reseeds)
  const { alive, age, ghost, gw, gh, cfg } = st
  for (let i = 0; i < gw * gh; i++) {
    const a = rng() < cfg.density ? 1 : 0
    alive[i] = a
    age[i] = a
    ghost[i] = 0
  }
  st.quietGens = 0
  st.gens = 0
  st.needBlit = true
}

export function createLifeState(cfg: GameOfLifeConfig, w: number, h: number): LifeState {
  const cell = cfg.cellSize
  const gw = Math.max(1, Math.ceil(w / cell))
  const gh = Math.max(1, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Game of Life requires a 2D context for its offscreen buffer')
  const { ageLUT, bg, ghostRGB } = buildColors(cfg.stops)
  const { birth, survive } = ruleMasks(cfg.rule)
  const st: LifeState = {
    cfg, w, h, gw, gh, cell,
    alive: new Uint8Array(gw * gh),
    next: new Uint8Array(gw * gh),
    age: new Uint16Array(gw * gh),
    ghost: new Uint8Array(gw * gh),
    birth, survive, ageLUT, bg, ghostRGB,
    off, offCtx, img: offCtx.createImageData(gw, gh),
    stepAcc: 0, quietGens: 0, gens: 0, reseeds: 0, needBlit: true,
  }
  seedBoard(st)
  return st
}

/** Re-fit the board to a new display size. Reallocates + reseeds only when the
 *  cell grid actually changes dimensions (a CA fills the screen, so — like demon —
 *  a genuine resize starts a fresh board); a same-dimension resize just re-blits. */
export function resizeLife(st: LifeState, w: number, h: number): void {
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
  st.ghost = new Uint8Array(gw * gh)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedBoard(st)
}

/** One generation: toroidal neighbour count → birth/survival, then age + ghost update. */
export function generation(st: LifeState): void {
  const { alive, next, age, ghost, birth, survive, gw, gh, cfg } = st
  const ghostStep = cfg.trail > 0 ? Math.ceil(255 / cfg.trail) : 255
  let changed = 0
  for (let y = 0; y < gh; y++) {
    const ym = ((y - 1 + gh) % gh) * gw
    const y0 = y * gw
    const yp = ((y + 1) % gh) * gw
    for (let x = 0; x < gw; x++) {
      const xm = (x - 1 + gw) % gw
      const xp = (x + 1) % gw
      const n = alive[ym + xm] + alive[ym + x] + alive[ym + xp]
              + alive[y0 + xm] + alive[y0 + xp]
              + alive[yp + xm] + alive[yp + x] + alive[yp + xp]
      const i = y0 + x
      const a = alive[i]
      const nv = a ? survive[n] : birth[n]
      next[i] = nv
      if (nv !== a) changed++
      if (nv) {
        age[i] = a ? (age[i] < AGE_CAP ? age[i] + 1 : AGE_CAP) : 1
        ghost[i] = 0
      } else {
        // a just-died cell lights a full ghost — but only if trails are on, else
        // trail:0 would flash a one-generation ghost (not "crisp classic Life").
        if (a) { if (cfg.trail > 0) ghost[i] = 255 }
        else if (ghost[i] > 0) ghost[i] = ghost[i] > ghostStep ? ghost[i] - ghostStep : 0
        age[i] = 0
      }
    }
  }
  // swap: next becomes the current board
  st.alive = next
  st.next = alive
  st.gens++
  st.quietGens = changed <= 2 ? st.quietGens + 1 : 0
  if (st.quietGens >= QUIET_RESEED || st.gens >= MAX_GENS) {
    st.reseeds++
    seedBoard(st)
  }
  st.needBlit = true
}

/** Paint the board into the offscreen buffer and blit it, scaled crisply. */
export function renderLife(st: LifeState, ctx: CanvasRenderingContext2D): void {
  const { img, alive, age, ghost, ageLUT, bg, ghostRGB, gw, gh } = st
  const data = img.data
  for (let i = 0; i < gw * gh; i++) {
    const o = i * 4
    if (alive[i]) {
      let a = age[i]
      if (a < 1) a = 1
      else if (a > AGE_CAP) a = AGE_CAP
      const d = a * 4
      data[o] = ageLUT[d]; data[o + 1] = ageLUT[d + 1]; data[o + 2] = ageLUT[d + 2]
    } else if (ghost[i] > 0) {
      const g = (ghost[i] / 255) * 0.6
      data[o] = bg[0] + (ghostRGB[0] - bg[0]) * g
      data[o + 1] = bg[1] + (ghostRGB[1] - bg[1]) * g
      data[o + 2] = bg[2] + (ghostRGB[2] - bg[2]) * g
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
