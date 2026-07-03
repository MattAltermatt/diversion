import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'
import type { AbelianSandpileConfig } from './schema'

// Grain-topples per second = cfg.speed × this, spread across frames by dt (so the
// bloom runs at the same wall-clock pace at 30/60/120 Hz). A cascade bigger than a
// frame's slice carries over to the next frame (the abelian pile stabilizes to the
// same result regardless of order), so the fractal crystallizes over many frames —
// you watch the avalanche front spread outward — without blowing the frame budget.
export const BUDGET_UNIT = 12_000_000

// Cap dt so a stall (tab refocus, GC pause) can't dump a giant batch in one frame.
const MAX_DT = 34

// Total grains dumped ≈ FILL_K × cells, split across sources — sized so the
// stabilized disk nearly fills the grid (radius ≈ 0.47·N) with a small margin
// from the edge (the sandpile disk holds ~2.1 grains/cell).
const FILL_K = 1.5

export type SandpileState = {
  cfg: AbelianSandpileConfig
  N: number
  w: number // display size, CSS px
  h: number
  grid: Int32Array // grain count per cell
  queue: Int32Array // ring buffer of unstable cells
  qHead: number
  qTail: number
  inQueue: Uint8Array
  dirty: Int32Array // cells whose count changed this frame
  dirtyCount: number
  dirtyFlag: Uint8Array
  fullRepaint: boolean
  lut: Uint8ClampedArray // 4 grain-counts × RGBA
  sources: Int32Array
  phase: 'grow' | 'hold'
  holdTimer: number // ms held since the mandala finished
  reseeds: number
  needBlit: boolean // force a re-blit next frame (after a resize) even if nothing changed
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
}

/** Bake grain-counts 0..3 into an RGBA LUT sampled along the color ramp. */
export function buildLUT(stops: string[]): Uint8ClampedArray {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Uint8ClampedArray(4 * 4)
  for (let c = 0; c < 4; c++) {
    const col = sampleGradientRGBA(s8, c / 3)
    lut[c * 4 + 0] = Math.round(col.r)
    lut[c * 4 + 1] = Math.round(col.g)
    lut[c * 4 + 2] = Math.round(col.b)
    lut[c * 4 + 3] = 255
  }
  return lut
}

/** Source cell indices. One source is dead-center (the symmetric mandala); more
 *  are placed at seeded random interior points. Deterministic for a given seed. */
export function computeSources(N: number, count: number, seed: number): Int32Array {
  const c = (N - 1) >> 1
  if (count <= 1) return Int32Array.of(c * N + c)
  const rng = mulberry32(seed)
  const margin = Math.floor(N * 0.25)
  const span = N - 2 * margin
  const arr = new Int32Array(count)
  for (let i = 0; i < count; i++) {
    const x = margin + Math.floor(rng() * span)
    const y = margin + Math.floor(rng() * span)
    arr[i] = y * N + x
  }
  return arr
}

function paintCell(data: Uint8ClampedArray, i: number, count: number, lut: Uint8ClampedArray): void {
  const c = count > 3 ? 3 : count
  const o = i * 4
  const d = c * 4
  data[o] = lut[d]
  data[o + 1] = lut[d + 1]
  data[o + 2] = lut[d + 2]
  data[o + 3] = 255
}

function markDirty(st: SandpileState, i: number): void {
  if (!st.dirtyFlag[i]) {
    st.dirtyFlag[i] = 1
    st.dirty[st.dirtyCount++] = i
  }
}

function enqueue(st: SandpileState, i: number): void {
  if (!st.inQueue[i]) {
    st.inQueue[i] = 1
    st.queue[st.qTail] = i
    st.qTail = (st.qTail + 1) % st.queue.length
  }
}

/** Drop `amount` grains onto cell `i`, queuing it if it becomes unstable. */
export function addGrains(st: SandpileState, i: number, amount: number): void {
  st.grid[i] += amount
  markDirty(st, i)
  if (st.grid[i] >= 4) enqueue(st, i)
}

/** Dump the whole pile onto the current sources — the seed of a growth cycle. */
export function dumpPile(st: SandpileState): void {
  const per = Math.max(4, Math.round((FILL_K * st.N * st.N) / st.sources.length))
  for (let s = 0; s < st.sources.length; s++) addGrains(st, st.sources[s], per)
}

export function createSandpileState(cfg: AbelianSandpileConfig, w: number, h: number): SandpileState {
  const N = cfg.detail
  const off = document.createElement('canvas')
  off.width = N
  off.height = N
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Abelian Sandpile requires a 2D context for its offscreen buffer')
  const img = offCtx.createImageData(N, N)
  const lut = buildLUT(cfg.stops)

  const st: SandpileState = {
    cfg, N, w, h,
    grid: new Int32Array(N * N),
    queue: new Int32Array(N * N + 1),
    qHead: 0, qTail: 0,
    inQueue: new Uint8Array(N * N),
    dirty: new Int32Array(N * N),
    dirtyCount: 0,
    dirtyFlag: new Uint8Array(N * N),
    fullRepaint: true,
    lut,
    sources: computeSources(N, cfg.sources, cfg.seed),
    phase: 'grow',
    holdTimer: 0,
    reseeds: 0,
    needBlit: true,
    off, offCtx, img,
  }
  for (let i = 0; i < N * N; i++) paintCell(img.data, i, 0, lut)
  offCtx.putImageData(img, 0, 0)
  return st
}

/** Clear the pile and start a fresh growth cycle (varying extra-source positions). */
function reset(st: SandpileState): void {
  st.grid.fill(0)
  st.inQueue.fill(0)
  st.dirtyFlag.fill(0)
  st.qHead = st.qTail = 0
  st.dirtyCount = 0
  st.phase = 'grow'
  st.holdTimer = 0
  st.reseeds++
  st.sources = computeSources(st.N, st.cfg.sources, st.cfg.seed + st.reseeds)
  st.fullRepaint = true
  dumpPile(st)
}

/** Advance one frame: run the toppling cascade up to the per-frame budget, then
 *  hold the finished mandala and regrow. Budget counts grains moved, so growth
 *  speed reads as the avalanche front spreading outward. */
export function stepSandpile(st: SandpileState, dt: number): void {
  const { grid, N } = st
  const last = N - 1
  const budget = (st.cfg.speed * BUDGET_UNIT * Math.min(dt, MAX_DT)) / 1000

  if (st.phase === 'hold') st.holdTimer += dt

  let processed = 0
  while (st.qHead !== st.qTail && processed < budget) {
    const i = st.queue[st.qHead]
    st.qHead = (st.qHead + 1) % st.queue.length
    st.inQueue[i] = 0
    const g = grid[i]
    if (g < 4) continue
    const t = g >> 2
    grid[i] = g - (t << 2)
    markDirty(st, i)
    processed += t
    const x = i % N
    const y = (i / N) | 0
    // one grain per topple to each in-grid neighbour; grains off the edge are lost
    if (x > 0) { const n = i - 1; grid[n] += t; markDirty(st, n); if (grid[n] >= 4) enqueue(st, n) }
    if (x < last) { const n = i + 1; grid[n] += t; markDirty(st, n); if (grid[n] >= 4) enqueue(st, n) }
    if (y > 0) { const n = i - N; grid[n] += t; markDirty(st, n); if (grid[n] >= 4) enqueue(st, n) }
    if (y < last) { const n = i + N; grid[n] += t; markDirty(st, n); if (grid[n] >= 4) enqueue(st, n) }
  }

  const settled = st.qHead === st.qTail
  if (settled && st.phase === 'grow') { st.phase = 'hold'; st.holdTimer = 0 } // crystallized
  if (settled && st.phase === 'hold' && st.holdTimer >= st.cfg.hold * 1000) reset(st)
}

/** Push the changed cells into the offscreen image and blit it. */
export function renderOffscreen(st: SandpileState): void {
  const { img, grid, lut } = st
  if (st.fullRepaint) {
    for (let i = 0; i < st.N * st.N; i++) paintCell(img.data, i, grid[i], lut)
    // this frame already repainted every cell, so drop the whole dirty set —
    // clearing the FLAGS too (not just the count), else cells marked earlier this
    // frame stay flagged and markDirty would refuse to re-list them next frame.
    st.dirtyFlag.fill(0)
    st.dirtyCount = 0
    st.fullRepaint = false
  } else {
    for (let k = 0; k < st.dirtyCount; k++) {
      const i = st.dirty[k]
      paintCell(img.data, i, grid[i], lut)
      st.dirtyFlag[i] = 0
    }
    st.dirtyCount = 0
  }
  st.offCtx.putImageData(img, 0, 0)
}

/** Contain-fit the square grid onto the display: scale so the whole mandala shows,
 *  centered on the (dark) background — a symmetric medallion is never cropped.
 *  Crisp nearest-neighbour when upsampling (play/fullscreen); smoothed when the
 *  grid is downscaled into a small tile (avoids moiré in the gallery thumbnail). */
export function blit(st: SandpileState, ctx: CanvasRenderingContext2D): void {
  const scale = Math.min(st.w, st.h) / st.N
  const size = st.N * scale
  ctx.imageSmoothingEnabled = scale < 1
  ctx.drawImage(st.off, (st.w - size) / 2, (st.h - size) / 2, size, size)
}
