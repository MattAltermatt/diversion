import { mulberry32 } from '../../framework/rng'
import type { ForestFireConfig } from './schema'

// The Drossel–Schwabl forest-fire cellular automaton — the canonical
// self-organized-criticality model. Each cell is EMPTY, a TREE, or BURNING.
// Per step: a burning cell becomes empty (leaving a fading ember); a tree with a
// burning neighbour catches; a lone tree ignites with tiny probability f
// (lightning); an empty cell grows a tree with probability p (growth). With
// p ≫ f the forest saturates between rare strikes, so a single spark can sweep a
// grid-spanning conflagration — fires of every scale, forever.

export const EMPTY = 0
export const TREE = 1
export const BURNING = 2

// Tree age is banked so recent growth reads darker than old, lush canopy.
export const TREE_AGE_CAP = 40

type RGB = [number, number, number]

export type ForestFireState = {
  cfg: ForestFireConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  // double-buffered grids (read `a`, write `b`, then swap)
  state: Uint8Array
  stateB: Uint8Array
  age: Uint8Array
  ageB: Uint8Array
  ember: Uint8Array
  emberB: Uint8Array
  rng: () => number
  // colour tables
  treeLUT: Uint8Array // (TREE_AGE_CAP+1) × RGB
  emberLUT: Uint8Array // (emberLife+1) × RGB
  groundRGB: RGB
  burnRGB: RGB
  // offscreen blit target
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  stepAcc: number
  needBlit: boolean
}

function hexToRGB(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function lerp(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function buildColors(cfg: ForestFireConfig): {
  treeLUT: Uint8Array; emberLUT: Uint8Array; groundRGB: RGB; burnRGB: RGB
} {
  const ground = hexToRGB(cfg.ground)
  const treeMature = hexToRGB(cfg.tree)
  const fire = hexToRGB(cfg.fire)
  // young growth is a darker shade of the mature canopy → depth of forest
  const treeYoung = lerp(ground, treeMature, 0.5)
  const treeLUT = new Uint8Array((TREE_AGE_CAP + 1) * 3)
  for (let a = 0; a <= TREE_AGE_CAP; a++) {
    const t = a <= 1 ? 0 : (a - 1) / (TREE_AGE_CAP - 1)
    const c = lerp(treeYoung, treeMature, t)
    treeLUT[a * 3] = c[0]; treeLUT[a * 3 + 1] = c[1]; treeLUT[a * 3 + 2] = c[2]
  }
  // ember e in 1..emberLife glows warm (fire→ground) and fades to bare ground
  const life = Math.max(1, cfg.emberLife)
  const emberLUT = new Uint8Array((cfg.emberLife + 1) * 3)
  for (let e = 0; e <= cfg.emberLife; e++) {
    const c = e === 0 ? ground : lerp(ground, fire, (e / life) * 0.8)
    emberLUT[e * 3] = c[0]; emberLUT[e * 3 + 1] = c[1]; emberLUT[e * 3 + 2] = c[2]
  }
  // the burning front pops slightly brighter/warmer than the ember colour
  const burnRGB = lerp(fire, [255, 244, 200], 0.18)
  return { treeLUT, emberLUT, groundRGB: ground, burnRGB }
}

/** Re-bake the colour tables in place (a live palette / ember-length edit). */
export function applyColors(st: ForestFireState): void {
  const { treeLUT, emberLUT, groundRGB, burnRGB } = buildColors(st.cfg)
  st.treeLUT = treeLUT
  st.emberLUT = emberLUT
  st.groundRGB = groundRGB
  st.burnRGB = burnRGB
  st.needBlit = true
}

/** Seed the grid from noise: each cell a tree with probability `initialDensity`. */
function seedGrid(st: ForestFireState): void {
  const { state, age, ember, gw, gh, cfg, rng } = st
  for (let i = 0; i < gw * gh; i++) {
    if (rng() < cfg.initialDensity) {
      state[i] = TREE
      age[i] = 1 + Math.floor(rng() * TREE_AGE_CAP * 0.5)
    } else {
      state[i] = EMPTY
      age[i] = 0
    }
    ember[i] = 0
  }
  st.needBlit = true
}

export function createForestFireState(cfg: ForestFireConfig, w: number, h: number): ForestFireState {
  const cell = cfg.cellSize
  const gw = Math.max(1, Math.ceil(w / cell))
  const gh = Math.max(1, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Forest Fire requires a 2D context for its offscreen buffer')
  const n = gw * gh
  const { treeLUT, emberLUT, groundRGB, burnRGB } = buildColors(cfg)
  const st: ForestFireState = {
    cfg, w, h, gw, gh, cell,
    state: new Uint8Array(n), stateB: new Uint8Array(n),
    age: new Uint8Array(n), ageB: new Uint8Array(n),
    ember: new Uint8Array(n), emberB: new Uint8Array(n),
    rng: mulberry32(cfg.seed >>> 0),
    treeLUT, emberLUT, groundRGB, burnRGB,
    off, offCtx, img: offCtx.createImageData(gw, gh),
    stepAcc: 0, needBlit: true,
  }
  seedGrid(st)
  return st
}

/** Re-fit to a new display size. Reallocates + reseeds only when the cell grid
 *  actually changes dimensions (a CA fills the screen, like Game of Life);
 *  a same-dimension resize just re-blits. */
export function resizeForestFire(st: ForestFireState, w: number, h: number): void {
  const gw = Math.max(1, Math.ceil(w / st.cell))
  const gh = Math.max(1, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) { st.needBlit = true; return }
  const n = gw * gh
  st.gw = gw
  st.gh = gh
  st.state = new Uint8Array(n); st.stateB = new Uint8Array(n)
  st.age = new Uint8Array(n); st.ageB = new Uint8Array(n)
  st.ember = new Uint8Array(n); st.emberB = new Uint8Array(n)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedGrid(st)
}

/** One synchronous step of the Drossel–Schwabl automaton (Moore-8 toroidal). */
export function stepForestFire(st: ForestFireState): void {
  const { state, stateB, age, ageB, ember, emberB, gw, gh, cfg, rng } = st
  const p = cfg.growth, f = cfg.lightning, emberLife = cfg.emberLife
  for (let y = 0; y < gh; y++) {
    const ym = ((y - 1 + gh) % gh) * gw
    const y0 = y * gw
    const yp = ((y + 1) % gh) * gw
    for (let x = 0; x < gw; x++) {
      const xm = (x - 1 + gw) % gw
      const xp = (x + 1) % gw
      const i = y0 + x
      const s = state[i]
      if (s === BURNING) {
        // a burning cell burns out, leaving a fresh ember
        stateB[i] = EMPTY
        ageB[i] = 0
        emberB[i] = emberLife
      } else if (s === TREE) {
        const burning =
          state[ym + xm] === BURNING || state[ym + x] === BURNING || state[ym + xp] === BURNING ||
          state[y0 + xm] === BURNING || state[y0 + xp] === BURNING ||
          state[yp + xm] === BURNING || state[yp + x] === BURNING || state[yp + xp] === BURNING
        if (burning || rng() < f) {
          stateB[i] = BURNING
          ageB[i] = 0
          emberB[i] = 0
        } else {
          stateB[i] = TREE
          ageB[i] = age[i] < TREE_AGE_CAP ? age[i] + 1 : TREE_AGE_CAP
          emberB[i] = 0
        }
      } else {
        // EMPTY: sprout a tree, or fade the ember
        if (rng() < p) {
          stateB[i] = TREE
          ageB[i] = 1
          emberB[i] = 0
        } else {
          stateB[i] = EMPTY
          ageB[i] = 0
          emberB[i] = ember[i] > 0 ? ember[i] - 1 : 0
        }
      }
    }
  }
  st.state = stateB; st.stateB = state
  st.age = ageB; st.ageB = age
  st.ember = emberB; st.emberB = ember
  st.needBlit = true
}

/** Paint the grid into the offscreen buffer and blit it, scaled crisply. */
export function renderForestFire(st: ForestFireState, ctx: CanvasRenderingContext2D): void {
  const { img, state, age, ember, treeLUT, emberLUT, groundRGB, burnRGB, gw, gh } = st
  const data = img.data
  const n = gw * gh
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const s = state[i]
    if (s === TREE) {
      const d = age[i] * 3
      data[o] = treeLUT[d]; data[o + 1] = treeLUT[d + 1]; data[o + 2] = treeLUT[d + 2]
    } else if (s === BURNING) {
      data[o] = burnRGB[0]; data[o + 1] = burnRGB[1]; data[o + 2] = burnRGB[2]
    } else {
      const e = ember[i]
      if (e > 0) {
        const d = e * 3
        data[o] = emberLUT[d]; data[o + 1] = emberLUT[d + 1]; data[o + 2] = emberLUT[d + 2]
      } else {
        data[o] = groundRGB[0]; data[o + 1] = groundRGB[1]; data[o + 2] = groundRGB[2]
      }
    }
    data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  st.needBlit = false
}
