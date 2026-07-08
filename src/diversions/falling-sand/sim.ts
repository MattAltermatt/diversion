import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'
import type { FallingSandConfig } from './schema'

// ── Elements ──
// A cell holds one of these ids. EMPTY is the only "nothing here" value; every
// other id is drawn from its own color and simulated by its own move rule.
export const EMPTY = 0
export const SAND = 1
export const WATER = 2
export const STONE = 3
export const PLANT = 4
export const FIRE = 5

const ALL_ELEMENTS = [SAND, WATER, FIRE, PLANT] as const

const FIRE_LIFE_MAX = 42 // ticks a fire cell burns before going out
const IGNITE_CHANCE = 0.35 // per neighbouring-plant-cell, per tick
const DRAIN_CHANCE = 0.07 // per bottom-row sand/water cell, per tick — the "sink"

type RGB = [number, number, number]

export type Emitter = {
  driftPhase: number
  driftSpeed: number
  element: number
  cycleT: number
  acc: number
}

export type FallingSandState = {
  cfg: FallingSandConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  grid: Uint8Array
  fireLife: Uint8Array
  moved: Uint8Array
  rng: () => number
  emitters: Emitter[]
  stepAcc: number
  t: number
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  colors: Record<number, RGB>
  bg: RGB
  needBlit: boolean
}

function hexRGB(hex: string): RGB {
  const c = parseHex6(hex)
  return [c.r, c.g, c.b]
}

/** Rebuild the color table + background in place (a live palette edit). */
export function applyColors(st: FallingSandState, cfg: FallingSandConfig): void {
  st.colors = buildColors(cfg.colors)
  st.bg = hexRGB(cfg.background)
  st.needBlit = true
}

function buildColors(colors: FallingSandConfig['colors']): Record<number, RGB> {
  return {
    [SAND]: hexRGB(colors.sand),
    [WATER]: hexRGB(colors.water),
    [FIRE]: hexRGB(colors.fire),
    [STONE]: hexRGB(colors.stone),
    [PLANT]: hexRGB(colors.plant),
  }
}

function enabledElements(cfg: FallingSandConfig): number[] {
  const list: number[] = []
  if (cfg.elements.emitSand) list.push(SAND)
  if (cfg.elements.emitWater) list.push(WATER)
  if (cfg.elements.emitFire) list.push(FIRE)
  if (cfg.elements.emitPlant) list.push(PLANT)
  return list.length > 0 ? list : [SAND] // never an empty palette
}

/** The top spouts only pour FALLING materials (sand/water). Plant is static and
 *  fire rises, so pouring them from the top would just pin them to the ceiling —
 *  instead plant sprouts as fuses rooted in the settled sand and fire sparks on
 *  those plants (see growGarden), which is where that interaction belongs. */
function emitterElements(cfg: FallingSandConfig): number[] {
  const list: number[] = []
  if (cfg.elements.emitSand) list.push(SAND)
  if (cfg.elements.emitWater) list.push(WATER)
  return list.length > 0 ? list : [SAND]
}

function createEmitters(cfg: FallingSandConfig, rng: () => number): Emitter[] {
  const pool = emitterElements(cfg)
  const out: Emitter[] = []
  for (let i = 0; i < cfg.emitterCount; i++) {
    out.push({
      driftPhase: rng() * Math.PI * 2,
      driftSpeed: 0.12 + rng() * 0.22,
      element: pool[Math.floor(rng() * pool.length)],
      cycleT: 3 + rng() * 6,
      acc: 0,
    })
  }
  return out
}

/** Re-roll the emitter roster (emitter count changed) — keeps the same rng stream. */
export function reseedEmitters(st: FallingSandState, cfg: FallingSandConfig): void {
  st.emitters = createEmitters(cfg, st.rng)
}

/** Pre-fill the bottom of the chamber (denser toward the floor) so the piece
 *  opens already populated with drifts of sand and pools of water, instead of an
 *  empty room that only trickles full over minutes. Physics settles it on the
 *  first ticks; emitters + the gated drain keep it in that band forever. */
function seedChamber(st: FallingSandState): void {
  const { grid, gw, gh, rng } = st
  const pool = enabledElements(st.cfg).filter((e) => e === SAND || e === WATER)
  const els = pool.length ? pool : [SAND]
  const startY = Math.floor(gh * 0.58)
  for (let y = startY; y < gh; y++) {
    const density = 0.55 + 0.4 * ((y - startY) / Math.max(1, gh - startY))
    for (let x = 0; x < gw; x++) {
      if (rng() < density) grid[y * gw + x] = els[Math.floor(rng() * els.length)]
    }
  }
}

export function createSandState(cfg: FallingSandConfig, w: number, h: number): FallingSandState {
  const cell = cfg.cellSize
  const gw = Math.max(1, Math.ceil(w / cell))
  const gh = Math.max(1, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Falling Sand requires a 2D context for its offscreen buffer')
  const rng = mulberry32(cfg.seed)
  const st: FallingSandState = {
    cfg, w, h, gw, gh, cell,
    grid: new Uint8Array(gw * gh),
    fireLife: new Uint8Array(gw * gh),
    moved: new Uint8Array(gw * gh),
    rng,
    emitters: createEmitters(cfg, rng),
    stepAcc: 0,
    t: 0,
    off, offCtx, img: offCtx.createImageData(gw, gh),
    colors: buildColors(cfg.colors),
    bg: hexRGB(cfg.background),
    needBlit: true,
  }
  seedChamber(st)
  return st
}

/** Re-fit the board to a new display size. Reallocates (losing the chamber) only
 *  when the cell grid actually changes dimensions; a same-dimension resize just re-blits. */
export function resizeSand(st: FallingSandState, w: number, h: number): void {
  const gw = Math.max(1, Math.ceil(w / st.cell))
  const gh = Math.max(1, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) { st.needBlit = true; return }
  st.gw = gw
  st.gh = gh
  st.grid = new Uint8Array(gw * gh)
  st.fireLife = new Uint8Array(gw * gh)
  st.moved = new Uint8Array(gw * gh)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  st.needBlit = true
}

/** Move `src` into `dst` if `dst` is EMPTY. Marks both indices moved so the same
 *  grain can't act twice in one tick (a later scan position reaching either index
 *  this tick sees `moved` and skips). */
function tryMove(st: FallingSandState, src: number, dst: number): boolean {
  if (st.grid[dst] !== EMPTY) return false
  st.grid[dst] = st.grid[src]
  st.grid[src] = EMPTY
  st.fireLife[dst] = st.fireLife[src]
  st.fireLife[src] = 0
  st.moved[src] = 1
  st.moved[dst] = 1
  return true
}

/** Sand sinks through water: swap places in-line. */
function trySwapWithWater(st: FallingSandState, src: number, dst: number): boolean {
  if (st.grid[dst] !== WATER) return false
  const tmp = st.grid[dst]
  st.grid[dst] = st.grid[src]
  st.grid[src] = tmp
  st.moved[src] = 1
  st.moved[dst] = 1
  return true
}

function updateSand(st: FallingSandState, x: number, y: number): void {
  const { gw, gh } = st
  const i = y * gw + x
  if (y + 1 >= gh) return // resting on the floor; drainBottom handles it
  const below = i + gw
  if (tryMove(st, i, below)) return
  if (trySwapWithWater(st, i, below)) return
  const leftFirst = st.rng() < 0.5
  const dl = x > 0 ? below - 1 : -1
  const dr = x < gw - 1 ? below + 1 : -1
  const first = leftFirst ? dl : dr
  const second = leftFirst ? dr : dl
  if (first >= 0 && tryMove(st, i, first)) return
  if (second >= 0 && tryMove(st, i, second)) return
}

function updateWater(st: FallingSandState, x: number, y: number): void {
  const { gw, gh } = st
  const i = y * gw + x
  if (y + 1 < gh) {
    const below = i + gw
    if (tryMove(st, i, below)) return
    const leftFirst = st.rng() < 0.5
    const dl = x > 0 ? below - 1 : -1
    const dr = x < gw - 1 ? below + 1 : -1
    const first = leftFirst ? dl : dr
    const second = leftFirst ? dr : dl
    if (first >= 0 && tryMove(st, i, first)) return
    if (second >= 0 && tryMove(st, i, second)) return
  }
  const leftFirst = st.rng() < 0.5
  const l = x > 0 ? i - 1 : -1
  const r = x < gw - 1 ? i + 1 : -1
  const first = leftFirst ? l : r
  const second = leftFirst ? r : l
  if (first >= 0 && tryMove(st, i, first)) return
  if (second >= 0 && tryMove(st, i, second)) return
}

function updateFire(st: FallingSandState, x: number, y: number): void {
  const { gw, gh } = st
  const i = y * gw + x
  st.fireLife[i]--
  if (st.fireLife[i] <= 0) {
    st.grid[i] = EMPTY
    st.fireLife[i] = 0
    st.moved[i] = 1
    return
  }
  const neighbors: number[] = []
  if (x > 0) neighbors.push(i - 1)
  if (x < gw - 1) neighbors.push(i + 1)
  if (y > 0) neighbors.push(i - gw)
  if (y < gh - 1) neighbors.push(i + gw)
  for (const n of neighbors) {
    if (st.grid[n] === WATER) {
      st.grid[i] = EMPTY
      st.fireLife[i] = 0
      st.moved[i] = 1
      return
    }
  }
  // A fire cell touching fuel clings to it (a burning fuse doesn't drift away
  // mid-ignition) — it only resumes rising once there's nothing left to catch.
  let touchingFuel = false
  for (const n of neighbors) {
    if (st.grid[n] === PLANT) {
      touchingFuel = true
      if (st.rng() < IGNITE_CHANCE) {
        st.grid[n] = FIRE
        st.fireLife[n] = FIRE_LIFE_MAX
        st.moved[n] = 1
      }
    }
  }
  if (touchingFuel) return
  if (y > 0) {
    const up = i - gw
    if (tryMove(st, i, up)) return
    const leftFirst = st.rng() < 0.5
    const ul = x > 0 ? up - 1 : -1
    const ur = x < gw - 1 ? up + 1 : -1
    const first = leftFirst ? ul : ur
    const second = leftFirst ? ur : ul
    if (first >= 0 && tryMove(st, i, first)) return
    if (second >= 0 && tryMove(st, i, second)) return
  }
}

/** One bottom-to-top gravity pass. Rows already scanned (below the current row)
 *  never get revisited, so downward moves naturally act once; the `moved` flags
 *  additionally guard sideways spread and fire's upward rise, whose destination
 *  can land in a not-yet-scanned row/column this same tick. */
function moveGrains(st: FallingSandState): void {
  st.moved.fill(0)
  const { grid, gw, gh } = st
  for (let y = gh - 1; y >= 0; y--) {
    const leftToRight = y % 2 === 0
    for (let xi = 0; xi < gw; xi++) {
      const x = leftToRight ? xi : gw - 1 - xi
      const i = y * gw + x
      if (st.moved[i]) continue
      const el = grid[i]
      if (el === EMPTY || el === STONE || el === PLANT) continue
      if (el === SAND) updateSand(st, x, y)
      else if (el === WATER) updateWater(st, x, y)
      else if (el === FIRE) updateFire(st, x, y)
    }
  }
}

const FILL_TARGET = 0.42 // let material pile to this fraction of the chamber before the sink opens

/** The bottom row is a soft sink — but only once the chamber has filled past
 *  FILL_TARGET. Below that the sink stays shut so sand/water actually PILE into
 *  drifts and pools (a powder toy, not a thin trickle); past it the sink opens so
 *  the autonomous emitters can pour forever without overflowing. */
function drainBottom(st: FallingSandState): void {
  const { grid, gw, gh, rng } = st
  let filled = 0
  for (let i = 0; i < grid.length; i++) if (grid[i] !== EMPTY) filled++
  if (filled / (gw * gh) < FILL_TARGET) return
  const y = gh - 1
  for (let x = 0; x < gw; x++) {
    const i = y * gw + x
    const el = grid[i]
    if ((el === SAND || el === WATER) && rng() < DRAIN_CHANCE) grid[i] = EMPTY
  }
}

function spawnGrain(st: FallingSandState, gx: number, gy: number, element: number): boolean {
  if (gx < 0 || gx >= st.gw || gy < 0 || gy >= st.gh) return false
  const i = gy * st.gw + gx
  if (st.grid[i] !== EMPTY) return false
  st.grid[i] = element
  if (element === FIRE) st.fireLife[i] = FIRE_LIFE_MAX
  return true
}

function updateEmitters(st: FallingSandState, dtSeconds: number): void {
  const pool = emitterElements(st.cfg)
  for (const e of st.emitters) {
    e.cycleT -= dtSeconds
    if (e.cycleT <= 0) {
      e.element = pool[Math.floor(st.rng() * pool.length)]
      e.cycleT = 3 + st.rng() * 6
    }
    const xFrac = 0.5 + 0.42 * Math.sin(st.t * e.driftSpeed + e.driftPhase)
    const gx = Math.round(xFrac * (st.gw - 1))
    e.acc += st.cfg.emitRate * dtSeconds
    while (e.acc >= 1) {
      e.acc -= 1
      // Pour across a small nozzle width so it reads as a spout/stream, not a
      // single-pixel thread — the offset is jittered per grain.
      const nozzle = gx + (Math.floor(st.rng() * 5) - 2)
      spawnGrain(st, nozzle, 0, e.element)
    }
  }
}

const SPROUT_TRIES = 1       // seed placements attempted per tick
const PLANT_GROW_CHANCE = 0.045 // per rooted plant cell per tick, grow one cell up
const MAX_FUSE = 16         // tallest a plant reed climbs above its sand root (cells)
const FIRE_SPARK_CHANCE = 0.05 // per tick, ignite one random plant so a reed catches

/** Plant + fire live at the ground, not the ceiling. Each tick: sprout a few
 *  plant seeds on the sand surface, grow rooted plants upward into empty space
 *  (fuses climbing from the sand), and occasionally spark one plant alight so
 *  fire climbs and consumes it (updateFire handles the burn + water dousing).
 *  Gated on the element toggles; scans top-down so a freshly grown cell isn't
 *  regrown the same tick. */
function growGarden(st: FallingSandState): void {
  const { grid, gw, gh, rng, cfg } = st
  if (cfg.elements.emitPlant) {
    for (let s = 0; s < SPROUT_TRIES; s++) {
      const gx = Math.floor(rng() * gw)
      // Find the column's topmost occupied cell; sprout only on a SETTLED sand
      // surface (sand with support below) — never on a mid-air falling grain,
      // which would fall away and strand the static plant in the sky.
      for (let y = 1; y < gh; y++) {
        const el = grid[y * gw + gx]
        if (el === EMPTY || el === WATER) continue // skip down through the water column
        // Root on a SETTLED sand bed (support below) — never a mid-air falling
        // grain, which would fall away and strand the reed in the sky. The reed
        // rises into the empty air or up through the water above it.
        const settled = y === gh - 1 || grid[(y + 1) * gw + gx] !== EMPTY
        const above = grid[(y - 1) * gw + gx]
        if (el === SAND && settled && (above === EMPTY || above === WATER) && rng() < 0.5) grid[(y - 1) * gw + gx] = PLANT
        break
      }
    }
    for (let y = 1; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x
        if (grid[i] !== PLANT) continue
        const up = grid[i - gw]
        if ((up !== EMPTY && up !== WATER) || rng() >= PLANT_GROW_CHANCE) continue
        // Walk down the reed: grow only if it's rooted in sand within MAX_FUSE
        // cells (caps height; disconnected floating plants never grow). Water
        // between reed segments is fine — reeds climb through it.
        let h = 0, yy = y
        while (yy < gh && h <= MAX_FUSE && (grid[yy * gw + x] === PLANT || grid[yy * gw + x] === WATER)) { h++; yy++ }
        if (h <= MAX_FUSE && yy < gh && grid[yy * gw + x] === SAND) grid[i - gw] = PLANT
      }
    }
  }
  if (cfg.elements.emitFire && rng() < FIRE_SPARK_CHANCE) {
    for (let tries = 0; tries < 24; tries++) {
      const i = Math.floor(rng() * gw * gh)
      if (grid[i] === PLANT) { grid[i] = FIRE; st.fireLife[i] = FIRE_LIFE_MAX; break }
    }
  }
}

/** One fixed physics tick: gravity/flow pass, drain the bottom sink, grow the
 *  ground garden (plant fuses + fire), advance emitters. `dtSeconds` paces
 *  emitter drift/cycling/emit-rate — pass 1/simSpeed from the diversion's
 *  fixed-step accumulator so timing tracks the sim clock, not frame rate. */
export function stepSand(st: FallingSandState, dtSeconds: number): void {
  st.t += dtSeconds
  moveGrains(st)
  drainBottom(st)
  growGarden(st)
  updateEmitters(st, dtSeconds)
  st.needBlit = true
}

/** Paint a small blob of `element` centred on a CSS-pixel point (pointer input). */
export function paintAt(st: FallingSandState, x: number, y: number, element: number, radius: number): void {
  const cx = Math.floor(x / st.cell)
  const cy = Math.floor(y / st.cell)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      const gx = cx + dx
      const gy = cy + dy
      if (gx < 0 || gx >= st.gw || gy < 0 || gy >= st.gh) continue
      const i = gy * st.gw + gx
      if (st.grid[i] === STONE) continue
      st.grid[i] = element
      st.fireLife[i] = element === FIRE ? FIRE_LIFE_MAX : 0
    }
  }
  st.needBlit = true
}

/** Paint the board into the offscreen buffer and blit it, scaled crisply. */
export function renderSand(st: FallingSandState, ctx: CanvasRenderingContext2D): void {
  const { img, grid, colors, bg, gw, gh } = st
  const data = img.data
  for (let i = 0; i < gw * gh; i++) {
    const o = i * 4
    const el = grid[i]
    const c = el === EMPTY ? bg : colors[el]
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  st.needBlit = false
}

export { ALL_ELEMENTS, FIRE_LIFE_MAX, IGNITE_CHANCE, DRAIN_CHANCE }
