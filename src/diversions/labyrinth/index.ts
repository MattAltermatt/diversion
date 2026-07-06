import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { labyrinthSchema, type LabyrinthConfig } from './schema'
import {
  initGL, render, endReached, regenerate, trailDims, uploadLUT, disposeGL,
  type LabyrinthGL, type Vec2,
} from './gl'
import { densityPresets, behaviorPresets, colorPresets } from './presets'
import {
  generateMaze, solvePath, rasterizeWalls, rasterizePath, mazeGridFor,
  distanceFromExit, rasterizeAttractant,
} from './maze'
import { initAgentsAtStart } from './agents'

type LabyrinthState = {
  gl: WebGL2RenderingContext
  res: LabyrinthGL
  cfg: LabyrinthConfig
  trailW: number; trailH: number
  solved: boolean; solveTimer: number; solveMix: number; regenCount: number
}

const RAMP_SECONDS = 0.5 // path-glow fade-in once solved
const SOLVE_MIX_MAX = 1.3

type Built = {
  wallData: Uint8Array; pathData: Uint8Array; attractData: Float32Array
  agentData: Float32Array; startCell: Vec2; endUV: Vec2
  rasterW: number; rasterH: number
}

/** Generate a maze sized to fill the trail field, solve it, and rasterize the
 *  wall + path masks. The trail texture is sized to the raster dims so masks line
 *  up 1:1 with the sim field. */
function buildMaze(cfg: LabyrinthConfig, trailW: number, trailH: number, subSeed: number): Built {
  const { cols, rows, cellPx } = mazeGridFor(cfg.mazeSize, trailW, trailH)
  const maze = generateMaze(subSeed, cols, rows)
  const path = solvePath(maze)
  // Walls ~12% of a cell, clamped to a visible minimum — thin enough to leave
  // wide corridors, thick enough to read as a labyrinth (not sub-pixel hairlines).
  const wallPx = Math.max(3, Math.round(cellPx * 0.12))
  const wallData = rasterizeWalls(maze, cellPx, wallPx)
  const pathData = rasterizePath(maze, path, cellPx)
  const attractData = rasterizeAttractant(maze, distanceFromExit(maze), cellPx)
  const startCell: Vec2 = { x: 1 / cols, y: 1 / rows }
  const endUV: Vec2 = { x: (cols - 0.5) / cols, y: (rows - 0.5) / rows }
  const agentData = initAgentsAtStart(subSeed, cfg.agents, startCell.x, startCell.y)
  return { wallData, pathData, attractData, agentData, startCell, endUV, rasterW: cols * cellPx, rasterH: rows * cellPx }
}

const presets: PresetGroup<LabyrinthConfig>[] = [
  { label: 'Density', options: densityPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Behavior', options: behaviorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const labyrinth = defineDiversion<typeof labyrinthSchema, LabyrinthState, 'webgl'>({
  id: 'labyrinth',
  title: 'Labyrinth',
  description: 'A slime mold explores a maze, grows to the far corner, and lights the shortest path.',
  kind: 'webgl',
  schema: labyrinthSchema,

  setup(gl, cfg, size: Size) {
    const { tw, th } = trailDims(size.width, size.height)
    const b = buildMaze(cfg, tw, th, cfg.seed)
    const res = initGL(gl, cfg, b.rasterW, b.rasterH, b.wallData, b.pathData, b.attractData, b.startCell, b.endUV)
    return {
      gl, res, cfg, trailW: b.rasterW, trailH: b.rasterH,
      solved: false, solveTimer: 0, solveMix: 0, regenCount: 0,
    }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    const dts = dt / 1000 // host passes dt in ms
    if (!state.solved) {
      render(gl, state.res, state.cfg, state.cfg.speed, 0)
      if (endReached(gl, state.res)) state.solved = true
    } else {
      // Freeze the sim, ramp the path glow in, hold, then regenerate a fresh maze.
      state.solveMix = Math.min(SOLVE_MIX_MAX, state.solveMix + dts / RAMP_SECONDS)
      state.solveTimer += dts
      render(gl, state.res, state.cfg, 0, state.solveMix)
      if (state.solveTimer >= state.cfg.holdAfterSolve) {
        state.regenCount++
        const sub = state.cfg.seed + state.regenCount * 1000
        const b = buildMaze(state.cfg, state.trailW, state.trailH, sub)
        regenerate(gl, state.res, b.wallData, b.pathData, b.attractData, b.agentData, b.startCell, b.endUV)
        state.solved = false; state.solveTimer = 0; state.solveMix = 0
      }
    }
  },

  // resize is a no-op: the display samples the trail/maze in normalized UV and
  // stretches to fill the screen, so window/fullscreen resize survives without
  // reallocation (the maze keeps its setup-time grid).

  update(state, cfg) {
    // Structural changes need a fresh maze / textures → full teardown + setup.
    if (cfg.mazeSize !== state.cfg.mazeSize || cfg.agents !== state.cfg.agents || cfg.seed !== state.cfg.seed) {
      return false
    }
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true // remaining params are per-step uniforms / display colors
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default labyrinth
