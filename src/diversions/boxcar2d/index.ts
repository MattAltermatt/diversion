import { defineDiversion, type Size } from '../../framework/types'
import { mulberry32 } from '../../framework/rng'
import { readMeta } from '../../framework/fieldMeta'
import { boxcar2dSchema, type BoxCar2DConfig } from './schema'
import { boxcar2dPresets } from './presets'
import { makeTerrain, terrainPoints } from './terrain'
import {
  createWorld,
  destroyWorld,
  destroyBody,
  stepWorld,
  buildTerrainBody,
  createPolygonBody,
  type WorldId,
  type BodyId,
} from './physics'
import { buildCar, carCentroid, type CarBodies } from './car'
import { breedGeneration, type Scored } from './ga'
import { randomGenome, DEFAULT_RANGES, type Genome } from './genome'
import { carFitness } from './fitness'
import { makeRubbleLayout, type RubbleLayout } from './rubble'
import { drawScene } from './render'

// Mechanism constants (not user-facing balance — the schema owns the tunables).
const GRAVITY = -10 // m/s²
const SEG_LEN = 1.5 // meters per terrain collision segment
const SPAWN_X = 3 // meters (inside the flat launch ramp)
const SPAWN_Y = 3 // meters above the start
// A car's run ends by a PROGRESS-RATE cull: it must gain at least `minProgress`
// meters of new distance within each `progressWindow` seconds, or it's culled.
// No time cap — a car that keeps covering ground runs forever; one that's in
// motion but not advancing (spinning, backflipping, creeping) is "stuck" and dies.
// Both thresholds are live config (schema). Window measured in fixed 1/60 steps.
// Endless-terrain sliding window: physics segments span [carX-BEHIND, carX+AHEAD];
// rebuilt forward when the car comes within REBUILD_MARGIN of the leading edge.
const WINDOW_BEHIND = 40
const WINDOW_AHEAD = 220
const REBUILD_MARGIN = 60
// Start-of-run grace: for the first GRACE_STEPS the car is immune to the progress
// cull, so it can drop from spawn, settle, and launch before "stuck" detection
// kicks in (light truss cars need a beat to orient). Per car (stepsThisCar resets
// on spawn). Goal-reach + time cap still apply during grace.
const GRACE_STEPS = 10 * 60 // 10 s at 60 Hz
// Mutation annealing: the rate cools from the schema's `mutationRate` (now a gen-1
// PEAK) toward a floor over ANNEAL_GENS generations. Wide early search keeps the
// "flailing wrecks" opening vivid; a low late rate lets a good car fine-tune
// instead of being shaken apart every generation (measured: a flat 0.21 made
// 40/40 elite children worse). Exogenous + deterministic — no genome-shape cost.
const ANNEAL_GENS = 8
const MUTATION_FLOOR_FRAC = 0.25
/** Mutation rate for a generation: gen-1 peak → floor (peak·FRAC) by ANNEAL_GENS. */
export function annealedRate(peak: number, generation: number): number {
  const floor = peak * MUTATION_FLOOR_FRAC
  const t = Math.min(1, Math.max(0, (generation - 1) / ANNEAL_GENS))
  return peak + (floor - peak) * t
}
// Track lifespan slider at its max = never regenerate (one track, mastered forever).
// Derived from the schema so it can never drift from the slider's actual max.
const TRACK_LIFESPAN_MAX = readMeta(boxcar2dSchema.shape.trackLifespan)!.max!
// Rubble: dynamic blocks live in a tight pool around the car (created once per car,
// reset on the next spawn). RUBBLE_GROUP 0 collides with the car (CAR_GROUP -1) and
// the static terrain. MAX hard-caps live bodies regardless of density (perf guard).
const RUBBLE_GROUP = 0
const RUBBLE_AHEAD = 70
const RUBBLE_BEHIND = 20
const MAX_RUBBLE_BLOCKS = 90
// Rubble-free launch zone: no blocks for the first RUBBLE_START_GAP meters past
// spawn, so cars get a clean run to build speed (and evolution a foothold) before
// the obstacle field begins.
const RUBBLE_START_GAP = 100

export interface BoxCarState {
  cfg: BoxCar2DConfig
  size: Size
  world: WorldId
  /** Endless deterministic terrain height function (meters). */
  terrainHeight: (x: number) => number
  /** Current sliding-window static terrain body + the x-range it covers. */
  terrainBody?: BodyId
  terrainStartX: number
  terrainEndX: number
  population: Genome[]
  scored: Scored[]
  carIndex: number
  generation: number
  current: { genome: Genome } & CarBodies
  camMX: number // camera center, world meters
  camMY: number
  bestDistMeters: number
  spawnX: number
  spawnY: number
  windowStartX: number // maxX at the start of the current progress window
  windowSteps: number // steps elapsed in the current progress window
  maxXThisCar: number
  rng: () => number
  /** Gen 1 & gen 3 fitnesses — observable for the determinism keystone test
   *  (gen 3 exercises the post-setup rng stream: breeding + selection + mutation). */
  firstGenFitness?: number[]
  thirdGenFitness?: number[]
  /** Render-only cache (sky gradient), keyed by height|skyColour. */
  skyGradient?: CanvasGradient
  skyKey?: string
  /** Seed of the CURRENT track (terrain + rubble derive from it; reseeded on regen). */
  trackSeed: number
  /** Physics steps elapsed for the current car (time-mode clock). */
  stepsThisCar: number
  /** Best finish time this track (seconds); Infinity until a car finishes. */
  bestTimeSec: number
  rubbleLayout: RubbleLayout | null
  rubbleBlocks: Map<number, { body: BodyId; size: number }>
  rubbleNextSlot: number
}

/** (Re)build the sliding-window terrain body centred on `centerX`. */
function rebuildTerrain(state: BoxCarState, centerX: number): void {
  if (state.terrainBody !== undefined) destroyBody(state.terrainBody)
  // snap to the SEG_LEN grid so collision segments line up with the rendered hills
  const startX = Math.floor((centerX - WINDOW_BEHIND) / SEG_LEN) * SEG_LEN
  const endX = centerX + WINDOW_AHEAD
  state.terrainBody = buildTerrainBody(
    state.world,
    terrainPoints(state.terrainHeight, startX, endX, SEG_LEN),
  )
  state.terrainStartX = startX
  state.terrainEndX = endX
}

/** Drop all current rubble bodies and repopulate from the car's spawn point.
 *  Called on every car spawn → identical, fair layout for all cars (no car
 *  bulldozes a path for the next). */
function resetRubble(state: BoxCarState): void {
  for (const b of state.rubbleBlocks.values()) destroyBody(b.body)
  state.rubbleBlocks.clear()
  state.rubbleNextSlot = state.rubbleLayout
    ? state.rubbleLayout.firstSlotAtOrAfter(state.spawnX + RUBBLE_START_GAP)
    : 0
}

/** Create rubble blocks just ahead of the car (once each) and prune ones far
 *  behind. Blocks are NEVER recreated mid-run, so a knocked-aside block stays put
 *  until the next car resets the field. */
function extendRubble(state: BoxCarState, carX: number): void {
  const L = state.rubbleLayout
  if (!L) return
  const ahead = carX + RUBBLE_AHEAD
  while (L.blockX(state.rubbleNextSlot) < ahead && state.rubbleBlocks.size < MAX_RUBBLE_BLOCKS) {
    const slot = state.rubbleNextSlot++
    const x = L.blockX(slot)
    const size = L.blockSize(slot)
    const half = size / 2
    const y = state.terrainHeight(x) + half + 0.05
    const body = createPolygonBody(state.world, {
      position: { x, y },
      vertices: [
        { x: -half, y: -half }, { x: half, y: -half },
        { x: half, y: half }, { x: -half, y: half },
      ],
      density: 0.1, friction: 0.5, groupIndex: RUBBLE_GROUP, // light → cars bash through
    })
    state.rubbleBlocks.set(slot, { body, size })
  }
  // Map iterates in slot (insertion) order and blockX is monotonic, so the
  // blocks behind the car are a prefix — stop at the first one still in range.
  const behind = carX - RUBBLE_BEHIND
  for (const [slot, b] of state.rubbleBlocks) {
    if (L.blockX(slot) >= behind) break
    destroyBody(b.body)
    state.rubbleBlocks.delete(slot)
  }
}

function spawnCar(state: BoxCarState): void {
  // each solo run starts at spawn → re-centre the endless terrain there
  rebuildTerrain(state, state.spawnX)
  const g = state.population[state.carIndex]
  const bodies = buildCar(state.world, g, { x: state.spawnX, y: state.spawnY })
  state.current = { genome: g, ...bodies }
  state.maxXThisCar = state.spawnX
  state.windowStartX = state.spawnX
  state.windowSteps = 0
  // snap the camera to the new car's start — centred on the ground at spawn
  // (not the drop height) so the car frames near the middle of the view.
  state.camMX = state.spawnX
  state.camMY = state.terrainHeight(state.spawnX) + 1
  state.stepsThisCar = 0
  resetRubble(state)
  extendRubble(state, state.spawnX) // populate the pool immediately (no 1-frame gap)
}

function endCurrentCar(state: BoxCarState, finished = false): void {
  const distance = Math.max(0, state.maxXThisCar - state.spawnX)
  const timeSec = state.stepsThisCar / 60
  const fitness = carFitness({
    mode: state.cfg.mode,
    finished,
    distance,
    goalDistance: state.cfg.goalDistance,
    timeCap: state.cfg.timeCap,
    timeSec,
  })
  state.scored.push({ genome: state.current.genome, fitness })
  if (state.cfg.mode === 'distance') {
    if (distance > state.bestDistMeters) state.bestDistMeters = distance
  } else if (finished && timeSec < state.bestTimeSec) {
    state.bestTimeSec = timeSec
  }

  // free the finished car's bodies (the long-running leak guard)
  for (const nd of state.current.nodes) destroyBody(nd.body)
  for (const w of state.current.wheels) destroyBody(w.body)

  state.carIndex++
  if (state.carIndex >= state.population.length) {
    if (state.generation === 1) state.firstGenFitness = state.scored.map((s) => s.fitness)
    if (state.generation === 3) state.thirdGenFitness = state.scored.map((s) => s.fitness)
    state.population = breedGeneration(
      state.scored,
      {
        eliteCount: state.cfg.eliteCount,
        // anneal: cfg.mutationRate is the gen-1 peak, cooling toward a floor as
        // the population converges (state.generation = the gen that just bred).
        mutationRate: annealedRate(state.cfg.mutationRate, state.generation),
        ranges: DEFAULT_RANGES,
      },
      state.rng,
    )
    state.generation++
    state.scored = []
    state.carIndex = 0
    // ∞ track lifespan (slider at max) = never regenerate. Otherwise a fresh track
    // every `trackLifespan` gens; terrain + rubble both derive from the new seed,
    // drawn from the same rng stream so a seed reproduces the whole run.
    const lifespanInfinite = state.cfg.trackLifespan >= TRACK_LIFESPAN_MAX
    if (!lifespanInfinite && (state.generation - 1) % state.cfg.trackLifespan === 0) {
      state.trackSeed = Math.floor(state.rng() * 1e9)
      state.terrainHeight = makeTerrain(state.trackSeed, state.cfg.roughness, state.cfg.terrainType)
      state.rubbleLayout = makeRubbleLayout(state.trackSeed, state.cfg.rubbleDensity)
      state.bestDistMeters = 0 // fresh track → fresh record
      state.bestTimeSec = Infinity
    }
  }
  spawnCar(state) // rebuilds terrain + rubble around spawn
}

function stepCar(state: BoxCarState): void {
  stepWorld(state.world, 1)
  state.stepsThisCar++
  const x = carCentroid(state.current).x
  if (x > state.maxXThisCar) state.maxXThisCar = x // furthest reached (fitness + flag)

  // Time mode: finish at the goal, or cull at the time cap.
  if (state.cfg.mode === 'time') {
    if (x >= state.spawnX + state.cfg.goalDistance) {
      endCurrentCar(state, true)
      return
    }
    if (state.stepsThisCar >= state.cfg.timeCap * 60) {
      endCurrentCar(state, false)
      return
    }
  }

  // Progress-rate cull (both modes): every `progressWindow` seconds, the car must
  // have gained at least `minProgress` m of new distance since the window opened,
  // else it's culled (moving-but-not-advancing counts as stuck).
  if (state.stepsThisCar <= GRACE_STEPS) {
    // grace period: immune to the progress cull. Keep the window anchored to the
    // car's current furthest point so the first real window measures progress only
    // AFTER the car has settled and launched (not from the spawn-drop position).
    state.windowStartX = state.maxXThisCar
    state.windowSteps = 0
  } else {
    state.windowSteps++
    if (state.windowSteps >= state.cfg.progressWindow * 60) {
      if (state.maxXThisCar - state.windowStartX < state.cfg.minProgress) {
        endCurrentCar(state, false)
        return
      }
      state.windowStartX = state.maxXThisCar
      state.windowSteps = 0
    }
  }

  // extend the endless terrain + rubble ahead of the car before it reaches the edge
  if (x + REBUILD_MARGIN > state.terrainEndX) rebuildTerrain(state, x)
  extendRubble(state, x)
}

export default defineDiversion<typeof boxcar2dSchema, BoxCarState, '2d'>({
  id: 'boxcar2d',
  title: 'BoxCar2D',
  description:
    'A genetic algorithm evolves little 2D cars across an endless hilly track — watch them go from flailing wrecks to confident hill-climbers, generation by generation. Clean-room remake of BoxCar2D (Rafael Matsunaga).',
  kind: '2d',
  schema: boxcar2dSchema,
  presets: boxcar2dPresets,

  setup(_ctx, config, size) {
    const rng = mulberry32(config.seed)
    const world = createWorld(GRAVITY)
    const population = Array.from({ length: config.population }, () => randomGenome(rng))
    const state: BoxCarState = {
      cfg: config,
      size,
      world,
      terrainHeight: makeTerrain(config.seed, config.roughness, config.terrainType),
      terrainBody: undefined,
      terrainStartX: 0,
      terrainEndX: 0,
      population,
      scored: [],
      carIndex: 0,
      generation: 1,
      current: undefined as unknown as BoxCarState['current'],
      camMX: SPAWN_X,
      camMY: SPAWN_Y,
      bestDistMeters: 0,
      spawnX: SPAWN_X,
      spawnY: SPAWN_Y,
      windowStartX: SPAWN_X,
      windowSteps: 0,
      maxXThisCar: SPAWN_X,
      rng,
      trackSeed: config.seed,
      stepsThisCar: 0,
      bestTimeSec: Infinity,
      rubbleLayout: makeRubbleLayout(config.seed, config.rubbleDensity),
      rubbleBlocks: new Map(),
      rubbleNextSlot: 0,
    }
    spawnCar(state)
    return state
  },

  frame(state, ctx, _t, dt) {
    // dt===0 is the framework's paused/reduced-motion static-repaint tick (a
    // resize or live config edit while frozen) — it must redraw, not advance the
    // physics sim. Normal ticks always pass a nonzero dt, so they still run
    // >=1 step.
    const steps = dt === 0 ? 0 : Math.max(1, state.cfg.speed)
    for (let i = 0; i < steps; i++) stepCar(state)
    // Flat 2D side view: lock the camera horizontally to the car (no smoothing —
    // the car stays pinned and the world scrolls). Vertically, hold the horizon
    // STILL and only pan when the car leaves a ±band, so the hills don't heave on
    // every bump while the car can never climb/drop off-screen.
    const cp = carCentroid(state.current)
    state.camMX = cp.x
    const BAND = 2 // meters
    if (cp.y > state.camMY + BAND) state.camMY = cp.y - BAND
    else if (cp.y < state.camMY - BAND) state.camMY = cp.y + BAND
    drawScene(ctx, state)
  },

  resize(state, size) {
    state.size = size
  },

  update(state, config, size) {
    const old = state.cfg
    // structural changes can't apply live → full re-setup
    if (
      config.seed !== old.seed ||
      config.population !== old.population ||
      config.roughness !== old.roughness ||
      config.trackLifespan !== old.trackLifespan ||
      config.eliteCount !== old.eliteCount ||
      config.mutationRate !== old.mutationRate ||
      config.mode !== old.mode ||
      config.goalDistance !== old.goalDistance ||
      config.terrainType !== old.terrainType ||
      config.rubbleDensity !== old.rubbleDensity
    ) {
      return false
    }
    // cosmetic + speed → live-apply
    state.cfg = config
    state.size = size
    return true
  },

  teardown(state) {
    destroyWorld(state.world)
  },
})
