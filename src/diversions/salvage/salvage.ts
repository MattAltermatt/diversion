import type { Size } from '../../framework/types'
import { mulberry32 } from '../../framework/rng'
// Shared with Ablation deliberately — see schema.ts and the spec's Reuse section.
import { quantize, contrastFloor, contrastCeiling } from '../ablation/quantize'
import { rotationOrder } from '../ablation/pictures'
import { buildContours, groundPalette } from './contours'
import { ensurePicture, getPicture, pictureVersion } from '../../framework/pictureStore'
import { getImage, currentImage, storeVersion } from '../../framework/imageStore'
import type { SalvageConfig } from './schema'
import { type SalvageState, type Phase, REST, FADE, CELLS_PER_DRONE, COLD_RETRY, ARENA_COLS, ARENA_ROWS, CELL_MIN, CELL_MAX, PIECE_FREE_FRACTION } from './state'
import { makeGrid, cellIndex, floodReach } from './grid'
import { partitionBlocks, expandChunks } from './chunks'
import { makeTrails, decay, clearTrails, fineSub } from './trails'
import { clearMound } from './mound'
import { stepColony, reconcileDrones, blankAll, relocateStranded } from './colony'

/** FNV-1a of an image id: the k-means is seeded from the PICTURE so it always
 *  quantizes to the same colours, whatever the visit's seed. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function activeSlug(cfg: SalvageConfig, generation: number): string | null {
  if (cfg.source !== 'Pictures') return null
  const order = rotationOrder(cfg.picture, cfg.seed)
  if (order.length === 0) return null
  return order[generation % order.length]
}

function resolveImage(cfg: SalvageConfig, generation: number) {
  if (cfg.source === 'Contours') return null // generated, never resolved from a store
  if (cfg.source === 'Pictures') {
    const slug = activeSlug(cfg, generation)
    if (!slug) return null
    ensurePicture(slug)
    const next = activeSlug(cfg, generation + 1)
    if (next && next !== slug) ensurePicture(next)
    return getPicture(slug)
  }
  return getImage(cfg.image) ?? currentImage()
}

function liveVersion(cfg: SalvageConfig): number {
  if (cfg.source === 'Contours') return 0 // no store behind it; nothing can land
  return cfg.source === 'Pictures' ? pictureVersion() : storeVersion()
}

/** Block-resolution geometry. A bundled sprite's block is one source pixel — and so
 *  is a tiny upload's, since upsampling pixel art into more blocks than it has pixels
 *  invents seams the artist never drew. A larger upload's block is a k×k cell square
 *  with k chosen so the picture is ≤ 48 blocks wide. Fractions are the spec's
 *  27% / 73% split.
 *
 *  `k` is the whole-number FLOOR of the box fill. A nearest-fill (round) rule was built
 *  twice for #319/#320: a 16 px sprite becomes 64×64 cells and either its 192-cell pieces
 *  never find a drop site, or — with the piece cap in `buildArena` tightened to make it
 *  safe — the pieces and the crews halve (a default-strength crew of 2, not 4). The
 *  owner chose the gather over the fuller picture; the fill is one constant away
 *  (`PIECE_FREE_FRACTION` 0.015 + `Math.round` here). The cap below is what a nearest-fill
 *  rule needs (the left edge must clear the 2-cell border at 27%: width ≤ 0.54·cols − 4)
 *  and is never binding under floor. A sprite that cannot fit even at k = 1 (a 48 px
 *  sprite on a 300 px tile) is resampled into the box by ONE scale on both axes — the old
 *  fallback clamped width and height independently and walled off a 15×49-cell box around
 *  15×30 cells of art on a phone. */
const SPRITE_MAX_PX = 48
export function geometry(cfg: SalvageConfig, cols: number, rows: number, imgW: number, imgH: number) {
  const boxW = Math.floor(cols * 0.40), boxH = Math.floor(rows * 0.70)
  const capW = Math.max(boxW, Math.floor(cols * 0.54) - 4), capH = Math.max(boxH, Math.floor(rows * 0.85))
  let bw: number, bh: number, k: number
  if (cfg.source === 'Contours') {
    // A generated map fills the box as a solid rectangle, its longer side capped at
    // SPRITE_MAX_PX blocks: at the 144×90 arena the box is 57×63, so k = 2 and the map
    // is 28×31 = 868 blocks, about 70 pieces at the default piece size.
    k = Math.max(1, Math.ceil(Math.max(boxW, boxH) / SPRITE_MAX_PX))
    bw = Math.max(1, Math.floor(boxW / k)); bh = Math.max(1, Math.floor(boxH / k))
  } else if (cfg.source === 'Pictures' || Math.max(imgW, imgH) <= SPRITE_MAX_PX) {
    bw = imgW; bh = imgH
    k = Math.max(1, Math.floor(Math.min(boxW / bw, boxH / bh)))
  } else {
    // A photograph: 48 blocks on its long side, the short side by its own aspect, so
    // the forbidden box is the art's box and not the arena's.
    const long = Math.max(imgW, imgH)
    bw = Math.max(1, Math.round(imgW / long * SPRITE_MAX_PX)); bh = Math.max(1, Math.round(imgH / long * SPRITE_MAX_PX))
    k = Math.max(1, Math.floor(Math.min(boxW / bw, boxH / bh)))
  }
  while (k > 1 && (bw * k > capW || bh * k > capH)) k--
  if (bw * k > capW || bh * k > capH) {
    const sc = Math.min(boxW / bw, boxH / bh)
    k = 1; bw = Math.max(1, Math.floor(bw * sc)); bh = Math.max(1, Math.floor(bh * sc))
  }
  const picCols = bw * k, picRows = bh * k
  const originCol = Math.max(0, Math.min(cols - picCols, Math.round(cols * 0.27 - picCols / 2)))
  const originRow = Math.max(0, Math.round((rows - picRows) / 2))
  return { bw, bh, k, picCols, picRows, originCol, originRow,
           seedCol: Math.max(0, Math.min(cols - 1, Math.round(cols * 0.73))), seedRow: Math.round(rows / 2) }
}

/** The cell for a canvas: the size that fits `ARENA_COLS × ARENA_ROWS` into it on the
 *  tighter side, clamped (see `state.ts`). */
export function cellFor(size: Size): number {
  return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.round(Math.min(size.height / ARENA_ROWS, size.width / ARENA_COLS))))
}

function emptyState(cfg: SalvageConfig, size: Size): SalvageState {
  const cell = cellFor(size)
  const cols = Math.max(8, Math.floor(size.width / cell))
  const rows = Math.max(8, Math.floor(size.height / cell))
  const n = cols * rows
  const grid = makeGrid(cols, rows)
  return {
    cfg, size, cell, cols, rows, grid, palette: [], chunks: [], drones: [], crews: [],
    trails: makeTrails(cols, rows, fineSub(cell, cols, rows)), phase: 'dismantle', phaseTime: 0, time: 0,
    nestSeed: cellIndex(grid, Math.round(cols * 0.73), Math.round(rows / 2)),
    picOriginCol: 0, picOriginRow: 0, picCols: 0, picRows: 0, hasPicture: false, generation: 0,
    imageVersion: liveVersion(cfg), arenaKey: '', rand: mulberry32(cfg.seed),
    dist: new Int32Array(n), prev: new Int32Array(n), queue: new Int32Array(n),
    moundAlpha: 1, pictureAlpha: 1, dirty: [-1], capacity: 10, nextResolve: 0,
    fields: new Map(), fieldVersion: 0, siteHint: { r: 0, extent: 0 },
  }
}

export function arenaCapacity(s: SalvageState): number {
  let reachable = 0
  for (const v of s.grid.reach) reachable += v
  return Math.min(s.cfg.drones, Math.max(10, Math.floor(reachable / CELLS_PER_DRONE)))
}

/** Build the picture, forbidden mask, reachability and capacity from the resolved
 *  image. False when the store is cold (or the image has no opaque pixel); the
 *  caller then retries only when the store's VERSION moves or COLD_RETRY seconds
 *  pass, never per frame. A call that resolves the SAME image the arena already
 *  shows is a no-op (the key carries the image id), so a version bump from some
 *  other sprite landing — the prefetch of the next one, Ablation's tile on the same
 *  page — never wipes a mound mid-run. */
function buildArena(s: SalvageState): boolean {
  s.imageVersion = liveVersion(s.cfg)
  s.nextResolve = s.time + COLD_RETRY
  const cfg = s.cfg
  let key: string, geo: ReturnType<typeof geometry>, q: ReturnType<typeof quantize>
  if (cfg.source === 'Contours') {
    // Generated, so it can never be cold — but the same key discipline applies:
    // re-building the arena for an identical map would wipe the mound mid-run. The
    // palette is NOT in the key: the band grid does not depend on it, so a ramp
    // change repaints in applyConfig instead.
    key = ['contours', s.cols, s.rows, cfg.colors, cfg.chunkSize, cfg.seed, s.generation,
           cfg.featureSize, cfg.roughness].join('|')
    if (key === s.arenaKey && s.hasPicture) return true
    geo = geometry(cfg, s.cols, s.rows, 0, 0)
    q = buildContours({ seed: cfg.seed, generation: s.generation, bw: geo.bw, bh: geo.bh, colors: cfg.colors,
                        palette: cfg.palette, featureSize: cfg.featureSize, roughness: cfg.roughness,
                        background: cfg.background })
  } else {
    const img = resolveImage(cfg, s.generation)
    if (!img) return false
    key = [img.id, s.cols, s.rows, cfg.colors, cfg.chunkSize, cfg.source, s.generation].join('|')
    if (key === s.arenaKey && s.hasPicture) return true
    geo = geometry(cfg, s.cols, s.rows, img.width, img.height)
    q = quantize(img, geo.bw, geo.bh, cfg.colors, hashId(img.id), true, cfg.background, false)
  }
  s.arenaKey = key
  if (!q.coverage.some((c) => c === 1)) return false
  const g = makeGrid(s.cols, s.rows)
  s.grid = g
  s.palette = q.palette
  // The forbidden mask first: the piece cap below is a fraction of what it leaves free.
  let free = 0
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
    const border = c < 2 || r < 2 || c >= s.cols - 2 || r >= s.rows - 2
    const box = c >= geo.originCol - 2 && c < geo.originCol + geo.picCols + 2 && r >= geo.originRow - 2 && r < geo.originRow + geo.picRows + 2
    if (border || box) g.forbid[cellIndex(g, c, r)] = 1
    else free++
  }
  // A piece is capped at PIECE_FREE_FRACTION of the free cells (k² cells per picture
  // pixel), or the mound cannot pack the last ones — see state.ts.
  const pieceCap = Math.max(1, Math.floor(free * PIECE_FREE_FRACTION / (geo.k * geo.k)))
  s.chunks = expandChunks(partitionBlocks(q.idx, q.coverage, geo.bw, geo.bh, Math.min(s.cfg.chunkSize, pieceCap)), q.idx, geo.bw, geo.k, geo.originCol, geo.originRow, g)
  s.picOriginCol = geo.originCol; s.picOriginRow = geo.originRow
  s.picCols = geo.picCols; s.picRows = geo.picRows
  s.nestSeed = cellIndex(g, geo.seedCol, geo.seedRow)
  floodReach(g, s.queue)
  s.fields.clear(); s.fieldVersion++
  s.siteHint.r = 0; s.siteHint.extent = 0
  s.capacity = arenaCapacity(s)
  s.crews = []
  s.trails = makeTrails(s.cols, s.rows, fineSub(s.cell, s.cols, s.rows))
  s.hasPicture = true
  s.dirty = [-1]
  blankAll(s)
  relocateStranded(s)
  reconcileDrones(s, s.capacity)
  return true
}

export function createState(cfg: SalvageConfig, size: Size): SalvageState {
  const s = emptyState(cfg, size)
  if (!buildArena(s)) { floodReach(s.grid, s.queue); s.capacity = arenaCapacity(s); reconcileDrones(s, s.capacity) }
  return s
}

function enter(s: SalvageState, phase: Phase): void { s.phase = phase; s.phaseTime = 0 }

/** Time to try the store again: its version moved, or the cold-retry timer lapsed. */
function shouldResolve(s: SalvageState): boolean {
  return liveVersion(s.cfg) !== s.imageVersion || s.time >= s.nextResolve
}

export function step(s: SalvageState, dtSeconds: number): void {
  const dt = dtSeconds * s.cfg.tempo
  s.time += dt
  if (!s.hasPicture && s.phase !== 'swap') {
    // Cold store: retry on a version bump or the timer; wander meanwhile.
    if (!(shouldResolve(s) && buildArena(s))) { stepColony(s, dt); return }
  } else if (s.hasPicture && liveVersion(s.cfg) !== s.imageVersion) {
    // Something landed in the store. If it is a DIFFERENT picture for this slot (a new
    // upload) the arena key changes and we start over; the same picture, or a store
    // that went cold, keeps the arena we have.
    buildArena(s)
  }
  s.phaseTime += dt
  decay(s.trails, dt, s.cfg.trailFade)
  switch (s.phase) {
    case 'dismantle':
      stepColony(s, dt)
      if (s.crews.length === 0 && s.chunks.every((c) => c.where === 'mound')) enter(s, 'rest')
      return
    case 'rest':
      stepColony(s, dt)
      if (s.phaseTime >= REST) enter(s, 'fadeOut')
      return
    case 'fadeOut':
      stepColony(s, dt)
      s.moundAlpha = Math.max(0, 1 - s.phaseTime / FADE)
      if (s.phaseTime >= FADE) {
        clearMound(s.grid, s.chunks)
        s.siteHint.r = 0; s.siteHint.extent = 0
        s.chunks = []
        clearTrails(s.trails)
        s.dirty = [-1]
        s.generation++
        s.hasPicture = false
        s.nextResolve = 0 // try the next picture on the very next frame
        enter(s, 'swap')
      }
      return
    case 'swap':
      // Build the next picture. A cold store keeps us here, wandering, retrying on a
      // version bump or the timer — never per frame, which on a dead link is a fetch
      // per frame.
      if (shouldResolve(s) && buildArena(s)) { s.moundAlpha = 1; s.pictureAlpha = 0; enter(s, 'fadeIn') }
      else stepColony(s, dt)
      return
    case 'fadeIn':
      stepColony(s, dt)
      s.pictureAlpha = Math.min(1, s.phaseTime / FADE)
      if (s.phaseTime >= FADE) { s.pictureAlpha = 1; enter(s, 'dismantle') }
      return
  }
}

/** Live-apply what can be applied live; false for anything structural. `background`
 *  is live: the contrast floor only feeds the final lightness stretch, never the
 *  clustering, so cell indices are untouched and only the palette strings move. */
export function applyConfig(s: SalvageState, cfg: SalvageConfig, size: Size): boolean {
  const prev = s.cfg
  const structural: Array<keyof SalvageConfig> = ['source', 'picture', 'image', 'colors', 'chunkSize', 'seed',
                                                   'featureSize', 'roughness']
  for (const k of structural) if (prev[k] !== cfg[k]) return false
  // The host can hand update() a size resize() never applied; setup() is right there.
  if (size.width !== s.size.width || size.height !== s.size.height) return false
  s.cfg = cfg
  // The Contours ramp is live: band indices never depend on it, so a preset pick, a
  // swatch drag or a ground change only re-reads the palette and repaints. Compared
  // by value — a re-decoded config carries a fresh array with the same stops.
  if (cfg.source === 'Contours' && s.hasPicture
      && (prev.palette.join(',') !== cfg.palette.join(',') || cfg.background !== prev.background)) {
    s.palette = groundPalette(cfg.palette, cfg.colors, cfg.background)
    s.dirty = [-1]
  }
  if (cfg.drones !== prev.drones) { s.capacity = arenaCapacity(s); reconcileDrones(s, s.capacity) }
  if (cfg.background !== prev.background) s.dirty = [-1] // the seams are painted in the ground colour
  // Gated on the floor OR ceiling actually moving: a dark→light ground moves the
  // ceiling (the lightest band must clear it) while the floor may not budge.
  if (s.hasPicture && cfg.source !== 'Contours' && cfg.background !== prev.background
      && (Math.abs(contrastFloor(cfg.background) - contrastFloor(prev.background)) > 1e-3
          || Math.abs(contrastCeiling(cfg.background) - contrastCeiling(prev.background)) > 1e-3)) {
    const img = resolveImage(cfg, s.generation)
    if (img) {
      const geo = geometry(cfg, s.cols, s.rows, img.width, img.height)
      s.palette = quantize(img, geo.bw, geo.bh, cfg.colors, hashId(img.id), true, cfg.background, false).palette
      s.dirty = [-1]
    }
  }
  return true
}

/** Rebuild the arena for a new canvas — keeping the RUN. The generation (and so the
 *  sprite), the rng stream and the clock carry over, and every drone keeps its pixel
 *  position: it is rescaled into the new grid, blanked (its path held old-grid
 *  indices), nudged off the new picture and trimmed or topped up to the new capacity.
 *  What it does NOT carry is the job: the picture is laid out whole again, the mound is
 *  cleared and the phase restarts at `dismantle` (a piece's cells are k×k per block, so
 *  a mound cannot be mapped across a change of grid). This used to be the host's
 *  fallback path for a Cell size drag too (#319) — a full `setup()` per input event,
 *  which reset `generation` to 0, dropped the mound and respawned every drone onto the
 *  same seeded layout: the owner's "the image dances". The knob is gone; a resize is
 *  the one thing that moves the cell now. */
export function regrid(s: SalvageState, size: Size): void {
  const cell = cellFor(size)
  // A change under one cell (a 5 px window nudge, a DPR-only backing-store change) moves
  // no grid line: keep the run, the mound and the phase, and just note the new size.
  if (cell === s.cell && Math.floor(size.width / cell) === s.cols && Math.floor(size.height / cell) === s.rows) { s.size = size; return }
  const carried = s.drones
  const scale = s.cell / cell
  const fresh = emptyState(s.cfg, size)
  fresh.generation = s.generation
  fresh.rand = s.rand
  fresh.time = s.time
  Object.assign(s, fresh)
  for (const d of carried) {
    d.x = Math.min(s.cols - 0.5, Math.max(0.5, d.x * scale))
    d.y = Math.min(s.rows - 0.5, Math.max(0.5, d.y * scale))
  }
  s.drones = carried
  if (!buildArena(s)) {
    floodReach(s.grid, s.queue)
    blankAll(s); relocateStranded(s)
    s.capacity = arenaCapacity(s); reconcileDrones(s, s.capacity)
  }
}

export function resizeState(s: SalvageState, size: Size): void { regrid(s, size) }
