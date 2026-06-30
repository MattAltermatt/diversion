import { defineDiversion, type Size } from '../../framework/types'
import { mulberry32 } from '../../framework/rng'
import { boxcar2dSchema, type BoxCar2DConfig } from './schema'
import { boxcar2dPresets } from './presets'
import { makeTerrain, terrainPoints } from './terrain'
import {
  createWorld,
  destroyWorld,
  destroyBody,
  stepWorld,
  buildTerrainBody,
  getBodyPosition,
  type WorldId,
  type BodyId,
} from './physics'
import { buildCar, type CarBodies } from './car'
import { breedGeneration, type Scored } from './ga'
import { randomGenome, DEFAULT_RANGES, type Genome } from './genome'
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

function spawnCar(state: BoxCarState): void {
  // each solo run starts at spawn → re-centre the endless terrain there
  rebuildTerrain(state, state.spawnX)
  const g = state.population[state.carIndex]
  const bodies = buildCar(state.world, g, { x: state.spawnX, y: state.spawnY }, {
    speed: state.cfg.motorSpeed,
    torque: state.cfg.motorTorque,
  })
  state.current = { genome: g, ...bodies }
  state.maxXThisCar = state.spawnX
  state.windowStartX = state.spawnX
  state.windowSteps = 0
  // snap the camera to the new car's start — centred on the ground at spawn
  // (not the drop height) so the car frames near the middle of the view.
  state.camMX = state.spawnX
  state.camMY = state.terrainHeight(state.spawnX) + 1
}

function endCurrentCar(state: BoxCarState): void {
  const fitness = Math.max(0, state.maxXThisCar - state.spawnX)
  state.scored.push({ genome: state.current.genome, fitness })
  if (fitness > state.bestDistMeters) state.bestDistMeters = fitness

  // free the finished car's bodies (the long-running leak guard)
  destroyBody(state.current.chassis)
  for (const w of state.current.wheels) destroyBody(w.body)

  state.carIndex++
  if (state.carIndex >= state.population.length) {
    if (state.generation === 1) state.firstGenFitness = state.scored.map((s) => s.fitness)
    if (state.generation === 3) state.thirdGenFitness = state.scored.map((s) => s.fitness)
    state.population = breedGeneration(
      state.scored,
      { eliteCount: state.cfg.eliteCount, mutationRate: state.cfg.mutationRate, ranges: DEFAULT_RANGES },
      state.rng,
    )
    state.generation++
    state.scored = []
    state.carIndex = 0
    // new endless track every `trackLifespan` generations — a fresh noise seed
    // drawn from the same rng stream so a seed reproduces the whole run.
    if ((state.generation - 1) % state.cfg.trackLifespan === 0) {
      state.terrainHeight = makeTerrain(Math.floor(state.rng() * 1e9), state.cfg.roughness)
      state.bestDistMeters = 0 // fresh track → fresh record
    }
  }
  spawnCar(state) // rebuilds terrain (with the current height fn) around spawn
}

function stepCar(state: BoxCarState): void {
  stepWorld(state.world, 1)
  const x = getBodyPosition(state.current.chassis).x
  if (x > state.maxXThisCar) state.maxXThisCar = x // furthest reached (fitness + flag)

  // Progress-rate cull: every `progressWindow` seconds, the car must have gained
  // at least `minProgress` m of new distance since the window opened, else it's
  // culled (moving-but-not-advancing counts as stuck). No time cap otherwise.
  state.windowSteps++
  if (state.windowSteps >= state.cfg.progressWindow * 60) {
    if (state.maxXThisCar - state.windowStartX < state.cfg.minProgress) {
      endCurrentCar(state)
      return
    }
    state.windowStartX = state.maxXThisCar
    state.windowSteps = 0
  }

  // extend the endless terrain ahead of the car before it reaches the edge
  if (x + REBUILD_MARGIN > state.terrainEndX) rebuildTerrain(state, x)
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
      terrainHeight: makeTerrain(config.seed, config.roughness),
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
    }
    spawnCar(state)
    return state
  },

  frame(state, ctx, _t, _dt) {
    const steps = Math.max(1, state.cfg.speed)
    for (let i = 0; i < steps; i++) stepCar(state)
    // Flat 2D side view: lock the camera horizontally to the car (no smoothing —
    // the car stays pinned and the world scrolls). Vertically, hold the horizon
    // STILL and only pan when the car leaves a ±band, so the hills don't heave on
    // every bump while the car can never climb/drop off-screen.
    const cp = getBodyPosition(state.current.chassis)
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
      config.mutationRate !== old.mutationRate
    ) {
      return false
    }
    // cosmetic + speed + motor → live-apply (motor takes effect on the next car)
    state.cfg = config
    state.size = size
    return true
  },

  teardown(state) {
    destroyWorld(state.world)
  },
})
