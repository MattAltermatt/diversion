// A hand-built SalvageState for unit tests: no stores, no DOM, no drones.
import { mulberry32 } from '../../framework/rng'
import { salvageSchema, type SalvageConfig } from './schema'
import { makeGrid, cellIndex, floodReach } from './grid'
import { partitionBlocks, expandChunks } from './chunks'
import { makeTrails, fineSub } from './trails'
import { CELLS_PER_DRONE, type SalvageState } from './state'

export interface TestPicture { bw: number; bh: number; idx: number[]; cov?: number[]; k?: number }

export function makeArena(
  over: Partial<SalvageConfig> = {},
  picture: TestPicture = { bw: 4, bh: 4, idx: new Array(16).fill(0) },
  cols = 30, rows = 16,
): SalvageState {
  const cfg = salvageSchema.parse(over)
  const grid = makeGrid(cols, rows)
  const k = picture.k ?? 1
  const idx = Uint8Array.from(picture.idx)
  const cov = Uint8Array.from(picture.cov ?? new Array(picture.idx.length).fill(1))
  const picCols = picture.bw * k, picRows = picture.bh * k
  const originCol = 4, originRow = Math.floor((rows - picRows) / 2)
  const chunks = expandChunks(partitionBlocks(idx, cov, picture.bw, picture.bh, cfg.chunkSize), idx, picture.bw, k, originCol, originRow, grid)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const border = c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2
    const box = c >= originCol - 2 && c < originCol + picCols + 2 && r >= originRow - 2 && r < originRow + picRows + 2
    if (border || box) grid.forbid[cellIndex(grid, c, r)] = 1
  }
  const reachable = floodReach(grid)
  const ncol = Math.max(...picture.idx) + 1
  const n = cols * rows
  return {
    cfg, size: { width: cols * cfg.cellSize, height: rows * cfg.cellSize }, cols, rows, grid,
    palette: Array.from({ length: ncol }, (_, i) => `#${(i * 40 + 60).toString(16).padStart(2, '0')}8080`),
    chunks, drones: [], crews: [], trails: makeTrails(cols, rows, fineSub(cfg.cellSize, cols, rows)),
    phase: 'dismantle', phaseTime: 0, time: 0,
    nestSeed: cellIndex(grid, cols - 6, Math.floor(rows / 2)),
    picOriginCol: originCol, picOriginRow: originRow, picCols, picRows,
    hasPicture: true, generation: 0, imageVersion: 0, arenaKey: 'test',
    rand: mulberry32(cfg.seed),
    dist: new Int32Array(n), prev: new Int32Array(n), queue: new Int32Array(n),
    moundAlpha: 1, pictureAlpha: 1, dirty: [-1],
    capacity: Math.min(cfg.drones, Math.max(10, Math.floor(reachable / CELLS_PER_DRONE))),
    nextResolve: 0, fields: new Map(), fieldVersion: 0, siteHint: { r: 0, extent: 0 },
  }
}
