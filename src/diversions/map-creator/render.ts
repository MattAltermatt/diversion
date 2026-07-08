// Map Creator (GH #150) — state lifecycle + parchment rendering. The field/biome
// grid is baked at a coarse resolution into an offscreen canvas (like Abelian
// Sandpile's LUT buffer) and stretched to fill the viewport; coastline, rivers,
// and the compass rose are drawn as vector strokes on top each frame, each
// staged to their own window of the overall reveal progress.
import { parseHex6, mix, type RGB } from '../../framework/color'
import type { Size } from '../../framework/types'
import {
  BIOMES, type Biome, type MapGrid, type GeneratedMap, generateMap,
  classifyGrid, buildLandOrder, buildCoastSegments, buildRivers,
} from './mapgen'
import { timelineFor, phaseAt, type Phase } from './timeline'
import type { MapCreatorConfig, MapPalette } from './schema'

// Full-field simulation (every grid cell is painted) — the parchment paper
// tone is a fixed constant rather than an exposed `background` field, per the
// schema-UX-canon exception for full-field sims.
const PARCHMENT: RGB = { r: 230, g: 214, b: 172 }

// Stage windows within the overall 0..1 reveal progress: sea washes in, then
// coastline ink traces around it, then biomes wash in low-to-high, then rivers.
const STAGE = {
  sea: [0, 0.14] as const,
  coast: [0.14, 0.32] as const,
  land: [0.32, 0.86] as const,
  river: [0.86, 1] as const,
}
const LAND_FADE = 0.025 // softness of each land cell's individual fade-in
const COMPASS_START = 0.9

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Directional relief shading from the elevation gradient — cheap (finite
 *  difference, no separate normal map) and gives the parchment its "hand-inked
 *  relief" read. Returns roughly [-1, 1]. */
function hillshade(grid: MapGrid, i: number, j: number): number {
  const { cols, rows, elevation } = grid
  const i0 = Math.max(0, i - 1), i1 = Math.min(cols - 1, i + 1)
  const j0 = Math.max(0, j - 1), j1 = Math.min(rows - 1, j + 1)
  const dzdx = (elevation[j * cols + i1] - elevation[j * cols + i0]) / Math.max(1, i1 - i0)
  const dzdy = (elevation[j1 * cols + i] - elevation[j0 * cols + i]) / Math.max(1, j1 - j0)
  const nx = -dzdx * 9, ny = -dzdy * 9, nz = 1
  const len = Math.hypot(nx, ny, nz)
  const lx = -0.55, ly = -0.6, lz = 0.58 // light from the upper-left
  return (nx * lx + ny * ly + nz * lz) / len
}

function biomeColors(palette: MapPalette): Record<Biome, RGB> {
  return {
    sea: parseHex6(palette.sea), beach: parseHex6(palette.beach), desert: parseHex6(palette.desert),
    grassland: parseHex6(palette.grassland), forest: parseHex6(palette.forest),
    mountain: parseHex6(palette.mountain), snow: parseHex6(palette.snow),
  }
}

/** Bake final per-cell RGB (biome color + hillshade + a little parchment-grain
 *  jitter) once per map/palette — never per frame. Jitter is derived from the
 *  cell's own elevation/moisture fractional bits, so it's deterministic without
 *  needing a dedicated RNG stream. */
function bakeColors(grid: MapGrid, palette: MapPalette): Uint8ClampedArray {
  const { cols, rows } = grid
  const colors = biomeColors(palette)
  const out = new Uint8ClampedArray(cols * rows * 3)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i
      const biome = BIOMES[grid.biome[idx]]
      const c = colors[biome]
      const shadeMul = biome === 'sea' ? 1 : 1 + hillshade(grid, i, j) * 0.28
      const jitter = ((grid.elevation[idx] * 97.13 + grid.moisture[idx] * 57.71) % 1 - 0.5) * 16
      const o = idx * 3
      out[o] = c.r * shadeMul + jitter
      out[o + 1] = c.g * shadeMul + jitter
      out[o + 2] = c.b * shadeMul + jitter
    }
  }
  return out
}

function buildLandRank(grid: MapGrid, landOrder: Int32Array): Float32Array {
  const rank = new Float32Array(grid.cols * grid.rows)
  const n = landOrder.length
  for (let k = 0; k < n; k++) rank[landOrder[k]] = n > 1 ? k / (n - 1) : 0
  return rank
}

export interface MapCreatorState {
  cfg: MapCreatorConfig
  w: number
  h: number
  cols: number
  rows: number
  map: GeneratedMap
  landRank: Float32Array
  baseRGB: Uint8ClampedArray
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  elapsed: number
  phase: Phase
  progress: number
  paintedProgress: number | null // last progress baked into `off`; null forces a repaint
}

function gridSize(size: Size): { cols: number; rows: number } {
  const CELL_TARGET = 7
  const cols = Math.max(70, Math.min(220, Math.round(size.width / CELL_TARGET)))
  const cellSize = size.width / cols
  const rows = Math.max(48, Math.round(size.height / cellSize))
  return { cols, rows }
}

function buildOffscreen(cols: number, rows: number) {
  const off = document.createElement('canvas')
  off.width = cols
  off.height = rows
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Map Creator requires a 2D context for its offscreen grid buffer')
  const img = offCtx.createImageData(cols, rows)
  return { off, offCtx, img }
}

export function createState(cfg: MapCreatorConfig, size: Size): MapCreatorState {
  const { cols, rows } = gridSize(size)
  const map = generateMap(cols, rows, { seaLevel: cfg.seaLevel, roughness: cfg.roughness, seed: cfg.seed })
  const { off, offCtx, img } = buildOffscreen(cols, rows)
  return {
    cfg, w: size.width, h: size.height, cols, rows, map,
    landRank: buildLandRank(map.grid, map.landOrder),
    baseRGB: bakeColors(map.grid, cfg.palette),
    off, offCtx, img,
    elapsed: 0, phase: 'reveal', progress: 0, paintedProgress: null,
  }
}

/** Geometry (the grid + every baked field) is viewport-independent — a resize
 *  just changes the extent the offscreen grid stretches into, never regenerates
 *  the map (viewport-independent-geometry-resize gotcha; ResizeObserver fires
 *  often, including for fullscreen/container reflow). */
export function resizeState(state: MapCreatorState, size: Size): void {
  state.w = size.width
  state.h = size.height
}

function fieldsChanged(a: MapCreatorConfig, b: MapCreatorConfig): boolean {
  return a.roughness !== b.roughness || a.seed !== b.seed
}
function classifyChanged(a: MapCreatorConfig, b: MapCreatorConfig): boolean {
  return a.seaLevel !== b.seaLevel
}

/** Live-apply a config edit (#270) — always applied without a full teardown +
 *  setup. Elevation/moisture only regenerate when roughness/seed changed;
 *  classification (biome + coastline + rivers) also regenerates on a sea-level
 *  edit; colors always rebake so a palette/ink tweak is never silently baked
 *  away. A structural change restarts the reveal so the reshaped continent
 *  draws itself in again. */
export function applyConfig(state: MapCreatorState, cfg: MapCreatorConfig): boolean {
  const regenFields = fieldsChanged(state.cfg, cfg)
  const regenClassify = regenFields || classifyChanged(state.cfg, cfg)
  state.cfg = cfg

  if (regenFields) {
    state.map = generateMap(state.cols, state.rows,
      { seaLevel: cfg.seaLevel, roughness: cfg.roughness, seed: cfg.seed })
  } else if (regenClassify) {
    const grid = state.map.grid
    const biome = classifyGrid(grid.cols, grid.rows, grid.elevation, grid.moisture, cfg.seaLevel)
    const newGrid: MapGrid = { cols: grid.cols, rows: grid.rows, elevation: grid.elevation, moisture: grid.moisture, biome }
    state.map = {
      grid: newGrid,
      landOrder: buildLandOrder(newGrid),
      coastSegments: buildCoastSegments(newGrid),
      rivers: buildRivers(newGrid, cfg.seed),
    }
  }
  if (regenClassify) {
    state.landRank = buildLandRank(state.map.grid, state.map.landOrder)
    state.elapsed = 0 // the land/coast reshaped — replay the draw-in
  }
  state.baseRGB = bakeColors(state.map.grid, cfg.palette)
  state.paintedProgress = null // force a repaint even if progress itself is unchanged (hold phase)
  return true
}

export function stepState(state: MapCreatorState, dt: number): void {
  state.elapsed += dt
  const tl = timelineFor(state.cfg.revealSpeed)
  const ps = phaseAt(state.elapsed, tl)
  state.phase = ps.phase
  state.progress = ps.progress
}

export function isDone(state: MapCreatorState): boolean {
  return state.phase === 'done'
}

function paintOffscreen(state: MapCreatorState): void {
  const { cols, rows, map, landRank, baseRGB, img, progress } = state
  const data = img.data
  const [seaS, seaE] = STAGE.sea
  const [landS, landE] = STAGE.land
  const seaAlpha = clamp01((progress - seaS) / (seaE - seaS))
  const landSpan = landE - landS
  for (let idx = 0; idx < cols * rows; idx++) {
    const biome = BIOMES[map.grid.biome[idx]]
    const alpha = biome === 'sea'
      ? seaAlpha
      : clamp01((progress - (landS + landRank[idx] * landSpan)) / LAND_FADE)
    const o = idx * 4
    const bo = idx * 3
    data[o] = PARCHMENT.r + (baseRGB[bo] - PARCHMENT.r) * alpha
    data[o + 1] = PARCHMENT.g + (baseRGB[bo + 1] - PARCHMENT.g) * alpha
    data[o + 2] = PARCHMENT.b + (baseRGB[bo + 2] - PARCHMENT.b) * alpha
    data[o + 3] = 255
  }
  state.offCtx.putImageData(img, 0, 0)
  state.paintedProgress = progress
}

function drawCoastline(ctx: CanvasRenderingContext2D, state: MapCreatorState): void {
  const { map, progress, w, h, cols, rows } = state
  const [cS, cE] = STAGE.coast
  const t = clamp01((progress - cS) / (cE - cS))
  const count = Math.floor(t * map.coastSegments.length)
  if (count <= 0) return
  const sx = w / cols, sy = h / rows
  ctx.strokeStyle = state.cfg.palette.ink
  ctx.lineWidth = Math.max(1, Math.min(sx, sy) * 0.35)
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let k = 0; k < count; k++) {
    const s = map.coastSegments[k]
    ctx.moveTo(s.x1 * sx, s.y1 * sy)
    ctx.lineTo(s.x2 * sx, s.y2 * sy)
  }
  ctx.stroke()
}

function drawRivers(ctx: CanvasRenderingContext2D, state: MapCreatorState): void {
  if (!state.cfg.showRivers) return
  const { map, progress, w, h, cols, rows } = state
  const [rS, rE] = STAGE.river
  const t = clamp01((progress - rS) / (rE - rS))
  if (t <= 0) return
  const sx = w / cols, sy = h / rows
  const riverRgb = mix(parseHex6(state.cfg.palette.sea), parseHex6(state.cfg.palette.ink), 0.35)
  ctx.strokeStyle = `rgb(${riverRgb.r},${riverRgb.g},${riverRgb.b})`
  ctx.lineWidth = Math.max(1, Math.min(sx, sy) * 0.45)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const river of map.rivers) {
    const n = Math.ceil(t * river.points.length)
    if (n < 2) continue
    ctx.beginPath()
    ctx.moveTo(river.points[0].x * sx, river.points[0].y * sy)
    for (let k = 1; k < n; k++) ctx.lineTo(river.points[k].x * sx, river.points[k].y * sy)
    ctx.stroke()
  }
}

function drawCompass(ctx: CanvasRenderingContext2D, state: MapCreatorState): void {
  if (!state.cfg.showCompass) return
  const t = clamp01((state.progress - COMPASS_START) / (1 - COMPASS_START))
  if (t <= 0) return
  const { w, h } = state
  const r = Math.min(w, h) * 0.055
  const cx = w - r * 2.2, cy = h - r * 2.2
  ctx.save()
  ctx.globalAlpha = t
  ctx.strokeStyle = state.cfg.palette.ink
  ctx.fillStyle = state.cfg.palette.ink
  ctx.lineWidth = Math.max(1, r * 0.06)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.85); ctx.lineTo(cx + r * 0.16, cy); ctx.lineTo(cx, cy + r * 0.85)
  ctx.lineTo(cx - r * 0.16, cy); ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.85, cy); ctx.lineTo(cx, cy + r * 0.16); ctx.lineTo(cx + r * 0.85, cy)
  ctx.lineTo(cx, cy - r * 0.16); ctx.closePath()
  ctx.stroke()
  ctx.font = `${Math.round(r * 0.5)}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', cx, cy - r * 1.25)
  ctx.restore()
}

export function draw(ctx: CanvasRenderingContext2D, state: MapCreatorState): void {
  if (state.paintedProgress !== state.progress) paintOffscreen(state)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(state.off, 0, 0, state.cols, state.rows, 0, 0, state.w, state.h)
  drawCoastline(ctx, state)
  drawRivers(ctx, state)
  drawCompass(ctx, state)
}
