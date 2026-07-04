// Maze — a clean-room take on xscreensaver's "maze": an endless two-phase loop.
// A perfect maze carves itself into being (walls receding as passages open), then
// a solver floods through it from entrance to exit and lights the solution; it
// holds, fades, and a fresh maze is seeded. The animated carve + solve IS the
// appeal. See maze.ts for the (DOM-free, deterministic) generation + solving.
import { defineDiversion, type Size } from '../../framework/types'
import { mazeSchema, type MazeConfig } from './schema'
import {
  generateMaze, solveOps, mazeLayout,
  N, E, S, W, type Layout,
} from './maze'

type Phase = 'carve' | 'solve' | 'hold' | 'fade'

type MazeState = {
  cfg: MazeConfig
  w: number; h: number; dpr: number
  lay: Layout
  // baked layers (device-px offscreen canvases; drawn in CSS px via a dpr transform)
  wallBuf: HTMLCanvasElement; wctx: CanvasRenderingContext2D
  solveBuf: HTMLCanvasElement; sctx: CanvasRenderingContext2D
  // carve
  edgeCell: Int32Array; edgeDir: Uint8Array; carvePtr: number; carveAcc: number
  headCell: number
  // solve
  opCells: Int32Array; opKinds: Uint8Array; solvePtr: number; solveAcc: number
  // lifecycle
  phase: Phase; timer: number; regen: number
}

const MAX_STEPS_PER_FRAME = 256 // cap post-stall bursts (tab refocus) so a frame never freezes

function makeBuf(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS px, backing store is device px
  return [c, g]
}

// --- wall geometry (CSS px, relative to the layout origin) ---
function cellXY(lay: Layout, i: number): [number, number] {
  const cx = i % lay.cols, cy = (i / lay.cols) | 0
  return [lay.ox + cx * lay.p, lay.oy + cy * lay.p]
}

/** Paint every wall of a full grid into wctx, then open the entrance + exit mouths.
 *  Each interior wall is the N or W of exactly one cell; the far border is the S of
 *  the bottom row and the E of the right column. */
function drawAllWalls(st: MazeState): void {
  const { wctx, lay, cfg } = st
  const { cols, rows, p, ox, oy } = lay
  const t = Math.max(2, Math.round(p * 0.16))
  wctx.clearRect(0, 0, st.w, st.h)
  wctx.fillStyle = cfg.wallColor
  const hBar = (cx: number, ry: number) => wctx.fillRect(ox + cx * p, oy + ry * p - t / 2, p, t)
  const vBar = (rx: number, cy: number) => wctx.fillRect(ox + rx * p - t / 2, oy + cy * p, t, p)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      hBar(cx, cy) // N
      vBar(cx, cy) // W
    }
    vBar(cols, cy) // E border
  }
  for (let cx = 0; cx < cols; cx++) hBar(cx, rows) // S border
  // Open the mouths: entrance = W wall of cell 0, exit = E wall of the last cell.
  openWall(st, 0, W)
  openWall(st, cols * rows - 1, E)
}

/** Erase the wall on `dir` side of cell `i` from wctx, leaving the corner posts so
 *  junctions stay crisp (interior openings are inset; the border mouths are full). */
function openWall(st: MazeState, i: number, dir: number): void {
  const { wctx, lay } = st
  const { cols, rows, p } = lay
  const t = Math.max(2, Math.round(p * 0.16))
  const cx = i % cols, cy = (i / cols) | 0
  const border = (dir === W && cx === 0) || (dir === E && cx === cols - 1)
    || (dir === N && cy === 0) || (dir === S && cy === rows - 1)
  const inset = border ? 0 : Math.min(t + 1, Math.floor(p * 0.3))
  const pad = t / 2 + 2 // clear the full band thickness plus a hair
  const [x, y] = cellXY(lay, i)
  if (dir === N) wctx.clearRect(x + inset, y - pad, p - 2 * inset, t + 4)
  else if (dir === S) wctx.clearRect(x + inset, y + p - pad, p - 2 * inset, t + 4)
  else if (dir === W) wctx.clearRect(x - pad, y + inset, t + 4, p - 2 * inset)
  else wctx.clearRect(x + p - pad, y + inset, t + 4, p - 2 * inset)
}

/** Paint a solver cell's full block into solveBuf; the wall layer is composited on
 *  top, so filling the whole block lets the colour glow through the carved openings
 *  (a continuous corridor) while the walls stay crisp. */
function paintCell(st: MazeState, i: number, color: string, alpha: number): void {
  const { sctx, lay } = st
  const [x, y] = cellXY(lay, i)
  sctx.globalAlpha = alpha
  sctx.fillStyle = color
  sctx.fillRect(x, y, lay.p, lay.p)
  sctx.globalAlpha = 1
}

/** (Re)build maze geometry + baked layers for a given sub-seed and reset the
 *  lifecycle to the carve phase. Used by setup, resize, and reseed. */
function build(st: MazeState, subSeed: number): void {
  st.lay = mazeLayout(st.w, st.h, st.cfg.cellSize)
  const carved = generateMaze(subSeed, st.lay.cols, st.lay.rows, st.cfg.generator)
  st.edgeCell = carved.edgeCell
  st.edgeDir = carved.edgeDir
  const ops = solveOps(carved.maze, st.cfg.solver)
  st.opCells = ops.cells
  st.opKinds = ops.kinds
  st.sctx.clearRect(0, 0, st.w, st.h)
  drawAllWalls(st)
  st.carvePtr = 0; st.carveAcc = 0; st.headCell = 0
  st.solvePtr = 0; st.solveAcc = 0
  st.timer = 0
  st.phase = 'carve'
}

function subSeedFor(cfg: MazeConfig, regen: number): number {
  return (cfg.seed + regen * 101) | 0
}

const maze = defineDiversion<typeof mazeSchema, MazeState, '2d'>({
  id: 'maze',
  title: 'Maze',
  description: 'A perfect maze carves itself into being, then a solver floods through it and '
    + 'lights the path from entrance to exit — endlessly reseeding. After xscreensaver’s maze.',
  kind: '2d',
  schema: mazeSchema,

  setup(_ctx, config, size: Size) {
    const dpr = Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    const [wallBuf, wctx] = makeBuf(size.width, size.height, dpr)
    const [solveBuf, sctx] = makeBuf(size.width, size.height, dpr)
    const st: MazeState = {
      cfg: config, w: size.width, h: size.height, dpr,
      lay: mazeLayout(size.width, size.height, config.cellSize),
      wallBuf, wctx, solveBuf, sctx,
      edgeCell: new Int32Array(0), edgeDir: new Uint8Array(0), carvePtr: 0, carveAcc: 0, headCell: 0,
      opCells: new Int32Array(0), opKinds: new Uint8Array(0), solvePtr: 0, solveAcc: 0,
      phase: 'carve', timer: 0, regen: 0,
    }
    build(st, subSeedFor(config, 0))
    return st
  },

  frame(state, ctx, _t, dt) {
    const dts = dt / 1000
    const { cfg } = state

    if (state.phase === 'carve') {
      state.carveAcc += cfg.carveSpeed * dts
      let steps = Math.floor(state.carveAcc)
      if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
      state.carveAcc -= steps
      if (state.carveAcc > MAX_STEPS_PER_FRAME) state.carveAcc = MAX_STEPS_PER_FRAME
      for (let s = 0; s < steps && state.carvePtr < state.edgeCell.length; s++) {
        const cell = state.edgeCell[state.carvePtr]
        const dir = state.edgeDir[state.carvePtr]
        openWall(state, cell, dir)
        // head = the newly-connected neighbour, for the live carve cursor
        const cx = cell % state.lay.cols, cy = (cell / state.lay.cols) | 0
        const dx = dir === E ? 1 : dir === W ? -1 : 0
        const dy = dir === S ? 1 : dir === N ? -1 : 0
        state.headCell = (cy + dy) * state.lay.cols + (cx + dx)
        state.carvePtr++
      }
      if (state.carvePtr >= state.edgeCell.length) { state.phase = 'solve'; state.solveAcc = 0 }
    } else if (state.phase === 'solve') {
      state.solveAcc += cfg.solveSpeed * dts
      let steps = Math.floor(state.solveAcc)
      if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
      state.solveAcc -= steps
      if (state.solveAcc > MAX_STEPS_PER_FRAME) state.solveAcc = MAX_STEPS_PER_FRAME
      for (let s = 0; s < steps && state.solvePtr < state.opCells.length; s++) {
        const cell = state.opCells[state.solvePtr]
        if (state.opKinds[state.solvePtr] === 1) paintCell(state, cell, cfg.solvedColor, 0.95)
        else paintCell(state, cell, cfg.pathColor, 0.42)
        state.headCell = cell
        state.solvePtr++
      }
      if (state.solvePtr >= state.opCells.length) { state.phase = 'hold'; state.timer = 0 }
    } else if (state.phase === 'hold') {
      state.timer += dt
      if (state.timer >= cfg.holdSeconds * 1000) { state.phase = 'fade'; state.timer = 0 }
    } else {
      state.timer += dt
      if (state.timer >= cfg.fadeSeconds * 1000) {
        state.regen++
        build(state, subSeedFor(cfg, state.regen))
      }
    }

    // --- composite: background (live) → solve layer → walls on top ---
    const overlay = state.phase === 'fade'
      ? Math.max(0, 1 - state.timer / (cfg.fadeSeconds * 1000)) : 1
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, state.w, state.h)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0) // blit device-px buffers 1:1
    ctx.globalAlpha = overlay
    ctx.drawImage(state.solveBuf, 0, 0)
    ctx.drawImage(state.wallBuf, 0, 0)
    ctx.restore()

    // live head cursor (carve frontier / solver head) — a small accent glow
    if (overlay > 0 && (state.phase === 'carve' || state.phase === 'solve')) {
      const [hx, hy] = cellXY(state.lay, state.headCell)
      const m = Math.max(1, Math.round(state.lay.p * 0.22))
      ctx.globalAlpha = 0.6 * overlay
      ctx.fillStyle = state.phase === 'carve' ? cfg.pathColor : cfg.solvedColor
      ctx.fillRect(hx + m, hy + m, state.lay.p - 2 * m, state.lay.p - 2 * m)
      ctx.globalAlpha = 1
    }
  },

  resize(state, size: Size) {
    if (Math.round(size.width) === state.w && Math.round(size.height) === state.h) return
    state.w = size.width; state.h = size.height
    const [wallBuf, wctx] = makeBuf(size.width, size.height, state.dpr)
    const [solveBuf, sctx] = makeBuf(size.width, size.height, state.dpr)
    state.wallBuf = wallBuf; state.wctx = wctx
    state.solveBuf = solveBuf; state.sctx = sctx
    build(state, subSeedFor(state.cfg, state.regen)) // grid dims change with size → fresh maze
  },

  update(state, config) {
    // Live-appliable: background (drawn each frame) + motion timings. Anything that
    // changes geometry or a baked colour needs a fresh build → fall back to setup.
    const structural = config.cellSize !== state.cfg.cellSize
      || config.generator !== state.cfg.generator
      || config.solver !== state.cfg.solver
      || config.seed !== state.cfg.seed
      || config.wallColor !== state.cfg.wallColor
      || config.pathColor !== state.cfg.pathColor
      || config.solvedColor !== state.cfg.solvedColor
    if (structural) return false
    state.cfg = config
    return true
  },
})

export default maze
