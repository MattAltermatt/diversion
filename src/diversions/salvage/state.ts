import type { Size } from '../../framework/types'
import type { SalvageConfig } from './schema'
import type { Grid } from './grid'
import type { Trails } from './trails'

// Every rate is in CELLS and SECONDS at tempo 1; `cfg.tempo` scales dt.
export const DRONE_SPEED = 3        // cells/s — a calm crawl; tempo scales it
export const WANDER_TURN = 2.5      // rad/s of heading jitter amplitude
export const TRAIL_DEPOSIT = 0.6    // field units per tinted drone per second
export const TRAIL_RECRUIT = 0.12   // strength above which a blank drone adopts the colour
export const CREW_PULL = 12         // path cells a half-crewed piece is worth in the pick score
export const HOME_PULL = 0.9        // rad/s a blank drone's heading bends toward the picture
export const HOME_NEAR = 4          // cells outside the picture's box where the pull switches off
export const FLOODS_PER_FRAME = 1   // tint-field floods per frame: the one expensive pick step, kept deterministic
export const WAIT_TIMEOUT = 25      // s a latched crew waits before releasing
export const SEEK_TIMEOUT = 40      // s of seeking without latching before going blank
export const STOLEN_LIMIT = 3       // targets lost in a row before going blank
export const PICK_BUDGET = 40       // cheap picks (a walk down a cached field) per frame
export const RETRY_AFTER = 5        // s before a piece with no drop site is offered again
export const COLD_RETRY = 5         // s between attempts to resolve a picture the store has not delivered
export const REST = 8               // s between the last drop and the fade
export const FADE = 3               // s for the mound-out and picture-in fades
export const SETTLE = 0.35          // s a crew takes to lower a piece onto its site
export const MIN_CARRY_FACTOR = 0.4 // slowest a heavy carry goes, as a fraction of drone speed
export const CELLS_PER_DRONE = 10   // density cap: at most one drone per this many reachable cells
/** The arena is a fixed NUMBER of cells; the cell is whatever makes that many fit the
 *  canvas (#319). 144×90 is the arena the piece shipped and was tuned on — 1440×900 at
 *  cell 10 — so a phone, a laptop and a 4K wall all run the same composition, drone
 *  size and pacing, scaled like a vector drawing, and nothing changes between sprites.
 *  The cell comes from whichever side is tighter (`min(H / 90, W / 144)`), NOT from the
 *  area: a square-root rule gave an ultrawide 3440×1440 only 72 rows, and a 63 px-tall
 *  sprite no longer fit at one cell per pixel and was resampled. Landscape always has
 *  90 rows; a portrait phone gets more. The clamp is the old slider's range, so no
 *  viewport reaches a regime the piece has not run in (a 300×190 gallery tile floors at
 *  4; 4K ceilings at 24, 160×90 cells — cheaper than the 83k cells cell 10 gave it). */
export const ARENA_COLS = 144
export const ARENA_ROWS = 90
export const CELL_MIN = 4
export const CELL_MAX = 24
/** A drone never draws smaller than this many px of glyph unit (#322): the cell derives
 *  to 4 on a phone or a gallery tile, where 0.45 of a cell is a sub-pixel body. Only the
 *  picture of the point grows — positions, speed and reach stay in cells. Above the
 *  floor the glyph is `cell · droneSize` as before (8 px at the shipped arena). */
export const GLYPH_MIN_PX = 6
export const BLANK = -1

export type Where = 'picture' | 'lifted' | 'mound'
export type Phase = 'dismantle' | 'rest' | 'fadeOut' | 'swap' | 'fadeIn'
export type DroneState = 'blank' | 'seeking' | 'latched' | 'carrying'

export interface Chunk {
  id: number
  color: number
  /** Grid indices of the cells the piece occupies in the picture. */
  home: Int32Array
  /** Blocks (source pixels), not cells — `strength` is in the same unit. */
  mass: number
  where: Where
  /** Cells currently occupied when `where !== 'lifted'`. */
  at: Int32Array | null
  crew: Crew | null
  /** Shape relative to its bounding box: (dx, dy) cell pairs, plus the box size. */
  local: Int32Array
  w: number
  h: number
  /** Sim time before which this piece is not offered (no drop site was found). */
  retryAt: number
  /** `isExposed` memoised against `fieldVersion` (exposure only changes on lift/drop/build). */
  exposed: boolean
  exposedV: number
}

export interface Drone {
  x: number
  y: number
  heading: number
  tint: number            // palette index, or BLANK
  state: DroneState
  target: number          // chunk id, or -1 (seeking with -1 = waiting in the pick queue)
  avoid: number           // chunk id this drone just gave up on, or -1
  path: number[]
  pathPos: number
  immuneUntil: Float64Array
  stolen: number
  seekTime: number
  legPhase: number        // distance travelled, drives the legs
  retiring: boolean       // a shrink asked for this drone to leave when free
}

export interface Crew {
  chunk: Chunk
  carriers: Drone[]
  moving: boolean
  waitTime: number
  /** Bounding-box anchor of the lifted piece, in cell units. */
  x: number
  y: number
  path: number[]
  pathPos: number
  /** Destination cells, reserved on the grid at lift time. */
  dest: Int32Array | null
  settle: number
  fromX: number
  fromY: number
}

export interface SalvageState {
  cfg: SalvageConfig
  size: Size
  /** Cell size in CSS px, derived from `size` (see `ARENA_COLS` / `ARENA_ROWS`). */
  cell: number
  cols: number
  rows: number
  grid: Grid
  palette: string[]
  chunks: Chunk[]
  drones: Drone[]
  crews: Crew[]
  trails: Trails
  phase: Phase
  phaseTime: number
  time: number
  nestSeed: number
  picOriginCol: number
  picOriginRow: number
  picCols: number
  picRows: number
  hasPicture: boolean
  generation: number
  imageVersion: number
  arenaKey: string
  rand: () => number
  /** BFS scratch, cols*rows each. */
  dist: Int32Array
  prev: Int32Array
  queue: Int32Array
  /** 0..1 alphas the render reads during the fades. */
  moundAlpha: number
  pictureAlpha: number
  /** Piece ids whose cells changed since the renderer last looked; -1 means "everything". */
  dirty: number[]
  /** How many drones the arena can hold (density cap applied to cfg.drones). */
  capacity: number
  /** Sim time of the next allowed picture-resolve attempt while the store is cold. */
  nextResolve: number
  /** One multi-source distance field per tint (see recruit.ts `fieldFor`), rebuilt
   *  lazily when `fieldVersion` moves — i.e. after any lift, drop or build. */
  fields: Map<number, TintField>
  fieldVersion: number
  /** Ring radius (and piece extent) of the last successful drop site; the next search starts near it. */
  siteHint: { r: number; extent: number }
}

export interface TintField {
  version: number
  dist: Int32Array
  prev: Int32Array
  /** Chunk id of the piece each cell's path leads to. */
  owner: Int32Array
}
