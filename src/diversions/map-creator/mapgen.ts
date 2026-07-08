// Map Creator (GH #150) — pure field generation, biome classification, and
// vector extraction (coastline + rivers). No canvas here; render.ts consumes
// this to bake pixels. Everything is deterministic for a given seed/cols/rows.
import { makeNoise3D, mulberry32 } from '../../framework/rng'

export const BIOMES = ['sea', 'beach', 'desert', 'grassland', 'forest', 'mountain', 'snow'] as const
export type Biome = (typeof BIOMES)[number]

const WORLD_SCALE = 2.4 // wavelengths of the largest elevation feature across the map
const ELEVATION_OCTAVES = 5
const MOISTURE_OCTAVES = 3
const ISLAND_FALLOFF = 0.55 // how strongly elevation is pulled down toward the edges
const RAIN_SHADOW = 0.15 // higher ground trends drier
const BEACH_WIDTH = 0.035
const MOUNTAIN_LEVEL = 0.72
const SNOW_LEVEL = 0.87
const DESERT_MOISTURE = 0.35
const FOREST_MOISTURE = 0.62
const RIVER_COUNT = 5

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Sum of `octaves` layers of a 2D noise sample, each half (persistence) the
 *  amplitude and double (lacunarity) the frequency of the last — classic fBm.
 *  Normalized by total amplitude so the result stays in [-1, 1] regardless of
 *  octave count. */
function fbm(
  sample: (x: number, y: number) => number,
  x: number, y: number, octaves: number, persistence: number, lacunarity = 2,
): number {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * sample(x * freq, y * freq)
    norm += amp
    amp *= persistence
    freq *= lacunarity
  }
  return norm > 0 ? sum / norm : 0
}

/** Classify one cell's biome from its elevation/moisture — standalone and pure
 *  so it's unit-testable without generating a whole field. */
export function classify(elevation: number, moisture: number, seaLevel: number): Biome {
  if (elevation < seaLevel) return 'sea'
  if (elevation < seaLevel + BEACH_WIDTH) return 'beach'
  if (elevation >= SNOW_LEVEL) return 'snow'
  if (elevation >= MOUNTAIN_LEVEL) return 'mountain'
  if (moisture < DESERT_MOISTURE) return 'desert'
  if (moisture < FOREST_MOISTURE) return 'grassland'
  return 'forest'
}

export interface FieldParams {
  seaLevel: number
  roughness: number
  seed: number
}

export interface MapGrid {
  cols: number
  rows: number
  elevation: Float32Array
  moisture: Float32Array
  biome: Uint8Array // index into BIOMES
}

/** Elevation + moisture fields, deterministic for a given seed/cols/rows/roughness.
 *  Elevation is seeded fBm value noise biased down toward the map edges (an
 *  "island falloff") so the land reads as one continent instead of noise
 *  speckle. Moisture is an independent fBm field with a mild rain-shadow term
 *  (higher ground trends drier). */
export function buildFields(
  cols: number, rows: number, params: FieldParams,
): { elevation: Float32Array; moisture: Float32Array } {
  const elevationNoise = makeNoise3D(params.seed >>> 0)
  const moistureNoise = makeNoise3D((params.seed + 104729) >>> 0) // offset by a prime, not 0/seed itself
  const persistence = 0.3 + clamp01(params.roughness) * 0.35
  const sampleE = (x: number, y: number) => elevationNoise(x, y, 0)
  const sampleM = (x: number, y: number) => moistureNoise(x, y, 0)

  // Pass 1: raw fBm (+ island falloff for elevation) — NOT yet normalized. A
  // sum of a handful of octaves rarely swings anywhere near its theoretical
  // [-1, 1] extremes over a small sampled window (WORLD_SCALE periods), so
  // using that nominal range directly is unsound: some seeds land the whole
  // field below sea level (or the whole field above it) — an all-sea or
  // all-land map with no coastline at all. Track the ACTUAL min/max realized
  // this map and rescale to fill 0..1 in pass 2, so every generated map spans
  // the full range regardless of seed/roughness/grid size.
  const rawE = new Float32Array(cols * rows)
  const rawM = new Float32Array(cols * rows)
  let eMin = Infinity, eMax = -Infinity
  let mMin = Infinity, mMax = -Infinity
  for (let j = 0; j < rows; j++) {
    const ny = j / rows
    const dy = (ny - 0.5) * 2
    for (let i = 0; i < cols; i++) {
      const nx = i / cols
      const dx = (nx - 0.5) * 2
      const idx = j * cols + i

      const e = fbm(sampleE, nx * WORLD_SCALE, ny * WORLD_SCALE, ELEVATION_OCTAVES, persistence)
        - (dx * dx + dy * dy) * ISLAND_FALLOFF * 0.5 // island falloff, pre-normalization
      rawE[idx] = e
      if (e < eMin) eMin = e
      if (e > eMax) eMax = e

      const m = fbm(sampleM, nx * WORLD_SCALE * 0.75, ny * WORLD_SCALE * 0.75, MOISTURE_OCTAVES, 0.5)
      rawM[idx] = m
      if (m < mMin) mMin = m
      if (m > mMax) mMax = m
    }
  }

  const eSpan = eMax - eMin || 1
  const mSpan = mMax - mMin || 1
  const elevation = new Float32Array(cols * rows)
  const moisture = new Float32Array(cols * rows)
  for (let idx = 0; idx < cols * rows; idx++) {
    const e = (rawE[idx] - eMin) / eSpan
    elevation[idx] = e
    const m = (rawM[idx] - mMin) / mSpan
    moisture[idx] = clamp01(m - e * RAIN_SHADOW)
  }
  return { elevation, moisture }
}

export function classifyGrid(
  cols: number, rows: number, elevation: Float32Array, moisture: Float32Array, seaLevel: number,
): Uint8Array {
  const biome = new Uint8Array(cols * rows)
  for (let idx = 0; idx < cols * rows; idx++) {
    biome[idx] = BIOMES.indexOf(classify(elevation[idx], moisture[idx], seaLevel))
  }
  return biome
}

export function buildGrid(cols: number, rows: number, params: FieldParams): MapGrid {
  const { elevation, moisture } = buildFields(cols, rows, params)
  const biome = classifyGrid(cols, rows, elevation, moisture, params.seaLevel)
  return { cols, rows, elevation, moisture, biome }
}

/** Land cell indices sorted by elevation ascending — the order biomes wash in
 *  during the reveal (low ground first, peaks last). */
export function buildLandOrder(grid: MapGrid): Int32Array {
  const land: number[] = []
  for (let idx = 0; idx < grid.cols * grid.rows; idx++) {
    if (BIOMES[grid.biome[idx]] !== 'sea') land.push(idx)
  }
  land.sort((a, b) => grid.elevation[a] - grid.elevation[b])
  return Int32Array.from(land)
}

export interface CoastSegment {
  x1: number; y1: number; x2: number; y2: number
  angle: number // atan2 from map center — lets the reveal "pen-trace" around the coast
}

/** One segment per land/sea edge, in grid-cell units (render.ts scales to
 *  pixels). Sorted by angle from the map center so a progressive reveal reads
 *  as a pen tracing the coastline around the continent. */
export function buildCoastSegments(grid: MapGrid): CoastSegment[] {
  const { cols, rows, biome } = grid
  const cx = cols / 2, cy = rows / 2
  const segs: CoastSegment[] = []
  const isSea = (i: number, j: number) =>
    i < 0 || j < 0 || i >= cols || j >= rows || BIOMES[biome[j * cols + i]] === 'sea'
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    segs.push({ x1, y1, x2, y2, angle: Math.atan2(my - cy, mx - cx) })
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (BIOMES[biome[j * cols + i]] === 'sea') continue
      if (isSea(i - 1, j)) push(i, j, i, j + 1)
      if (isSea(i + 1, j)) push(i + 1, j, i + 1, j + 1)
      if (isSea(i, j - 1)) push(i, j, i + 1, j)
      if (isSea(i, j + 1)) push(i, j + 1, i + 1, j + 1)
    }
  }
  segs.sort((a, b) => a.angle - b.angle)
  return segs
}

export interface RiverPath {
  points: { x: number; y: number }[] // grid-cell units (cell centers)
}

const NEIGHBORS_8: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/** Steepest-descent walk from a highland cell to the sea (or a local minimum,
 *  where the river just ends — a small inland lake). */
function traceRiver(grid: MapGrid, startIdx: number): RiverPath {
  const { cols, rows, elevation, biome } = grid
  const points: { x: number; y: number }[] = []
  const visited = new Set<number>()
  let idx = startIdx
  const maxSteps = cols + rows

  for (let step = 0; step < maxSteps; step++) {
    const i = idx % cols, j = Math.floor(idx / cols)
    points.push({ x: i + 0.5, y: j + 0.5 })
    if (BIOMES[biome[idx]] === 'sea') break
    visited.add(idx)

    let best = idx, bestE = elevation[idx]
    for (const [di, dj] of NEIGHBORS_8) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue
      const nidx = nj * cols + ni
      if (visited.has(nidx)) continue
      if (elevation[nidx] < bestE) { bestE = elevation[nidx]; best = nidx }
    }
    if (best === idx) break // local minimum — no lower neighbor, river pools here
    idx = best
  }
  return { points }
}

/** Pick up to `count` river sources from wet highlands (deterministically, via
 *  a seeded RNG stream distinct from the field noise) and trace each downhill. */
export function buildRivers(grid: MapGrid, seed: number, count = RIVER_COUNT): RiverPath[] {
  const { cols, rows, elevation, moisture, biome } = grid
  const candidates: number[] = []
  for (let idx = 0; idx < cols * rows; idx++) {
    const b = BIOMES[biome[idx]]
    if (b === 'sea' || b === 'beach') continue
    if (elevation[idx] >= MOUNTAIN_LEVEL - 0.06 && moisture[idx] > 0.4) candidates.push(idx)
  }
  candidates.sort((a, b) => (elevation[b] + moisture[b]) - (elevation[a] + moisture[a]))
  const pool = candidates.slice(0, Math.max(count * 3, 12))

  const rand = mulberry32((seed + 777) >>> 0)
  const chosen: number[] = []
  while (chosen.length < count && pool.length > 0) {
    const pick = Math.floor(rand() * pool.length)
    chosen.push(pool.splice(pick, 1)[0])
  }
  return chosen.map((idx) => traceRiver(grid, idx)).filter((r) => r.points.length > 2)
}

export interface GeneratedMap {
  grid: MapGrid
  landOrder: Int32Array
  coastSegments: CoastSegment[]
  rivers: RiverPath[]
}

export function generateMap(cols: number, rows: number, params: FieldParams): GeneratedMap {
  const grid = buildGrid(cols, rows, params)
  return {
    grid,
    landOrder: buildLandOrder(grid),
    coastSegments: buildCoastSegments(grid),
    rivers: buildRivers(grid, params.seed),
  }
}
