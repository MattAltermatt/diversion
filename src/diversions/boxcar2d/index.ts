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
import { buildCar, carCentroid, capturePose, staticCarShape, isExploded, type CarBodies } from './car'
import { updateLeaderboard, championLabel, type Champion } from './leaderboard'
import { makeGhostTrack, type GhostTrack } from './ghost'
import { breedGeneration, type Scored } from './ga'
import { randomGenome, EVOLVE_RANGES, type Genome } from './genome'
import { carFitness } from './fitness'
import { makeRubbleLayout, type RubbleLayout } from './rubble'
import { drawScene } from './render'
import { saveRun, loadRun, clearRun, sameRun, type RunBlob } from './persistence'

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
/** Signed delta in seconds, e.g. +1.2s / -0.4s (negative = ahead of the record). */
function fmtDelta(sec: number): string {
  return `${sec >= 0 ? '+' : '-'}${Math.abs(sec).toFixed(1)}s`
}

/** Split flash (#221): a car crossing the `mark` (m) at `time` (s), compared to the
 *  record-holder's split at that mark if one exists. `ahead` (green) = beating the
 *  record so far. Pure — unit-tested. */
export function splitFlashEvent(mark: number, time: number, recordTime?: number): { text: string; ahead: boolean } {
  if (recordTime === undefined) return { text: `${mark} m · ${time.toFixed(1)}s`, ahead: true }
  const delta = time - recordTime
  return { text: `${mark} m · ${time.toFixed(1)}s (${fmtDelta(delta)})`, ahead: delta < 0 }
}

/** Finish-delta flash (#230): a car finishing at `timeSec` vs the previous record
 *  `prevBest` (Infinity if none yet). `ahead` (green) = a new record. Pure — unit-tested. */
export function finishFlashEvent(timeSec: number, prevBest: number): { text: string; ahead: boolean } {
  if (!Number.isFinite(prevBest)) return { text: `Finished ${timeSec.toFixed(1)}s`, ahead: true }
  const delta = timeSec - prevBest
  return { text: delta < 0 ? `New best · ${fmtDelta(delta)}` : `+${delta.toFixed(1)}s`, ahead: delta < 0 }
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
// Champions panel (#225): how many top cars the "hall of champions" holds.
const LEADERBOARD_SIZE = 5

// Resume decision (#226), routed from the Play screen into setup(). setup() only
// receives `config`, which can't distinguish a seedless resume from an explicit
// ?seed=N that happens to match a saved run (e.g. a shared ?seed=42 link, 42 being
// the default) — the former must resume, the latter must be a fresh run. So the
// decision is made ONCE in resumeConfig (which sees the URL params) and stashed here
// for the setup() that immediately follows. NOT cleared by setup: React strict-mode
// double-invokes setup() in dev, and resumeConfig refreshes this before any later
// boxcar2d setup runs. The sameRun() gate in setup is a belt-and-suspenders check so
// a stale value can never resume the wrong (e.g. Config-screen) config.
let pendingResume: RunBlob | null = null

// The config the CURRENT session is allowed to persist under, or null if this session
// must not touch the resume slot. Armed by the Play screen (armPersistence) with the
// mounted config for a seedless run, and disarmed (null) on unmount and for an
// explicit ?seed run. Default null so a session that never armed it — the Config-
// screen live preview and the Gallery thumbnail, which mount the diversion but never
// call armPersistence — can NEVER auto-save and clobber the user's bred run. The
// save is additionally gated on sameRun(persistFor, cfg): even a stale value left by
// a prior Play mount can't write, because a different screen's config (always a fresh
// random seed) won't match. This is deliberately NOT the diversion inferring its own
// screen — the Play screen, which alone knows a run is persistable, tells it.
let persistFor: BoxCar2DConfig | null = null

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
  /** Record-holder's time (s) at each 100 m mark; empty until a car finishes (#221). */
  bestSplits: number[]
  /** Current car's time (s) at each 100 m mark reached so far; reset per car (#221). */
  splitsThisCar: number[]
  /** Furthest distance (m) any car has reached this track — drives the time-mode
   *  pre-record flag and the progress ribbon's furthest marker (#221 / #229). */
  furthestMeters: number
  /** Transient split flash under the HUD (#221) / finish-delta flash (#230): text +
   *  ahead(green)/behind(red) + a wall-clock expiry (ms). Set from the sim as a
   *  `pending*` event (no clock there) and armed with an expiry in frame(), where t
   *  is known; render draws whatever is non-null. */
  splitFlash: { text: string; ahead: boolean; expiresAt: number } | null
  finishFlash: { text: string; ahead: boolean; expiresAt: number } | null
  pendingSplit: { text: string; ahead: boolean } | null
  pendingFinish: { text: string; ahead: boolean } | null
  rubbleLayout: RubbleLayout | null
  rubbleBlocks: Map<number, { body: BodyId; size: number }>
  rubbleNextSlot: number
  /** Ghost replay (#227), time mode only. `ghostRecording` accrues the current car's
   *  per-step pose; on a new record it's promoted to `ghostTrack` (the record-holder
   *  replayed alongside later cars). Transient — no persist, cleared on track regen. */
  ghostRecording: number[][]
  ghostTrack: GhostTrack | null
  /** Top-cars "hall of champions" (#225): the best genomes this run as mini-car
   *  thumbnails, ranked by fitness. Transient — refills from the persisted elites
   *  within a generation on resume; reset on track regen (old terrain's fitnesses). */
  leaderboard: Champion[]
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
  state.splitsThisCar = []
  // fresh recording buffer per car (a NEW array — the promoted ghostTrack owns the old one)
  state.ghostRecording = []
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
  // Fold this run into the champions panel (#225). Deduped by genome reference, so an
  // elite re-running each generation updates its card instead of spamming duplicates.
  state.leaderboard = updateLeaderboard(
    state.leaderboard,
    {
      genome: state.current.genome,
      fitness,
      label: championLabel(state.cfg.mode, finished, timeSec, distance),
      shape: staticCarShape(state.current.genome),
    },
    LEADERBOARD_SIZE,
  )
  if (distance > state.furthestMeters) state.furthestMeters = distance
  if (state.cfg.mode === 'distance') {
    if (distance > state.bestDistMeters) state.bestDistMeters = distance
  } else if (finished) {
    // Finish-delta flash (#230) — computed against the PREVIOUS record, then the
    // record + its splits are updated if this car beat it (#221 splits-vs-record).
    state.pendingFinish = finishFlashEvent(timeSec, state.bestTimeSec)
    if (timeSec < state.bestTimeSec) {
      state.bestTimeSec = timeSec
      state.bestSplits = [...state.splitsThisCar]
      // Promote this run to the ghost (#227) — its bodies still exist here (freed just
      // below), but makeGhostTrack only reads plain shape data + the recorded frames.
      state.ghostTrack = makeGhostTrack(state.current, state.ghostRecording)
    }
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
        ranges: EVOLVE_RANGES,
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
      state.bestSplits = [] // fresh track → fresh splits + furthest marker
      state.furthestMeters = 0
      state.ghostTrack = null // fresh track → old ghost's path no longer valid (#227)
      state.leaderboard = [] // fresh track → old champions' fitnesses were on the old terrain (#225)
    }
    // Auto-persist at the generation boundary (#226): the freshly-bred population is
    // the resumable checkpoint. Cheap (≤40 small genomes), fail-soft, once per gen.
    // Only when the Play screen armed THIS run for persistence (see persistFor); the
    // sameRun gate makes a stale arming from a prior mount harmless.
    if (persistFor && sameRun(persistFor, state.cfg)) saveRun({
      config: state.cfg,
      population: state.population,
      generation: state.generation,
      bestDistMeters: state.bestDistMeters,
      bestTimeSec: state.bestTimeSec,
      bestSplits: state.bestSplits,
      trackSeed: state.trackSeed,
    })
  }
  spawnCar(state) // rebuilds terrain + rubble around spawn
}

function stepCar(state: BoxCarState): void {
  stepWorld(state.world, 1)
  state.stepsThisCar++
  const x = carCentroid(state.current).x
  if (isExploded(x, state.spawnX)) { endCurrentCar(state, false); return } // cull blow-ups
  if (x > state.maxXThisCar) state.maxXThisCar = x // furthest reached (fitness + flag)
  const dist = x - state.spawnX
  if (dist > state.furthestMeters) state.furthestMeters = dist // pre-record flag + ribbon

  // Ghost recording (#227): capture this car's pose each step in time mode, but only
  // while it could still beat the record — a car already slower than the record time
  // can't become the ghost, so stop recording it (bounds memory to the record's length).
  if (
    state.cfg.mode === 'time' &&
    (!Number.isFinite(state.bestTimeSec) || state.stepsThisCar <= state.bestTimeSec * 60)
  ) {
    state.ghostRecording.push(capturePose(state.current))
  }

  // Time mode: record 100 m split crossings (splits-vs-record, #221), then finish at
  // the goal / cull at the time cap.
  if (state.cfg.mode === 'time') {
    // Each newly-crossed 100 m mark below the goal records this car's time and flashes
    // it against the record-holder's split (green if ahead of the record, red behind).
    while (
      (state.splitsThisCar.length + 1) * 100 < state.cfg.goalDistance &&
      dist >= (state.splitsThisCar.length + 1) * 100
    ) {
      const mark = (state.splitsThisCar.length + 1) * 100
      const t = state.stepsThisCar / 60
      state.splitsThisCar.push(t)
      state.pendingSplit = splitFlashEvent(mark, t, state.bestSplits[state.splitsThisCar.length - 1])
    }
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
    // Resume a persisted run (#226) when one matches this exact run-shape. The route
    // layer (PlayScreen) only feeds us the saved config on a seedless visit, so a
    // fresh visit / explicit ?seed / different config falls through to a fresh run.
    // The genomes ARE the payload — we do NOT re-simulate from the seed; the rng
    // stream simply restarts, so post-resume breeding diverges from an uninterrupted
    // run (accepted: the seed only ever fixed gen 1). trackSeed is restored so a run
    // that had regenerated its track (finite lifespan) resumes on the right terrain.
    const saved = pendingResume
    const resuming = saved !== null && sameRun(saved.config, config)
    const trackSeed = resuming ? saved!.trackSeed : config.seed
    const population = resuming
      ? saved!.population
      : Array.from({ length: config.population }, () => randomGenome(rng))
    const state: BoxCarState = {
      cfg: config,
      size,
      world,
      terrainHeight: makeTerrain(trackSeed, config.roughness, config.terrainType),
      terrainBody: undefined,
      terrainStartX: 0,
      terrainEndX: 0,
      population,
      scored: [],
      carIndex: 0,
      generation: resuming ? saved!.generation : 1,
      current: undefined as unknown as BoxCarState['current'],
      camMX: SPAWN_X,
      camMY: SPAWN_Y,
      bestDistMeters: resuming ? saved!.bestDistMeters : 0,
      spawnX: SPAWN_X,
      spawnY: SPAWN_Y,
      windowStartX: SPAWN_X,
      windowSteps: 0,
      maxXThisCar: SPAWN_X,
      rng,
      trackSeed,
      stepsThisCar: 0,
      bestTimeSec: resuming ? saved!.bestTimeSec : Infinity,
      // Race feedback (#221/#229/#230): bestSplits IS persisted (restored with the
      // record time — a converged run may never beat it, so it can't refill). The
      // rest (per-car splits, furthest, live flashes) is transient and recomputes.
      bestSplits: resuming ? saved!.bestSplits : [],
      splitsThisCar: [],
      furthestMeters: 0,
      splitFlash: null,
      finishFlash: null,
      pendingSplit: null,
      pendingFinish: null,
      rubbleLayout: makeRubbleLayout(trackSeed, config.rubbleDensity),
      rubbleBlocks: new Map(),
      rubbleNextSlot: 0,
      // Ghost replay is transient — a resumed run has no ghost until a car beats the
      // restored record time this session (mirrors the splits-on-resume behaviour).
      ghostRecording: [],
      ghostTrack: null,
      // Champions panel (#225): transient, rebuilt from runs this session (a resume
      // refills it from the persisted elites within a generation), so nothing to restore.
      leaderboard: [],
    }
    spawnCar(state)
    return state
  },

  resumeConfig(params, direct) {
    // Resume READ only (persistence arming is armPersistence's job). Resume the saved
    // run only on a direct load / reload (not an in-app Play click, so a just-
    // configured world is always honored) of a seedless URL — an explicit ?seed=N is
    // the reproducible / share path and always starts fresh. ('seed' is the flat URL
    // key; it is globally unique in this schema.) Idempotent: safe to call more than
    // once per mount (React may re-run the resolver); stashes the decision for the
    // setup() that follows (see `pendingResume`).
    pendingResume = !params.has('seed') && direct ? loadRun() : null
    return pendingResume ? pendingResume.config : null
  },

  armPersistence(config) {
    // The Play screen alone knows a run is persistable (a seedless Play mount) and
    // hands us the exact mounted config; it disarms (null) on unmount and for an
    // explicit ?seed. No other screen calls this, so a preview/thumbnail can't persist.
    persistFor = config
  },

  clearPersistedRun() {
    clearRun()
  },

  frame(state, ctx, t, dt) {
    // dt===0 is the framework's paused/reduced-motion static-repaint tick (a
    // resize or live config edit while frozen) — it must redraw, not advance the
    // physics sim. Normal ticks always pass a nonzero dt, so they still run
    // >=1 step.
    const steps = dt === 0 ? 0 : Math.max(1, state.cfg.speed)
    for (let i = 0; i < steps; i++) stepCar(state)
    // Arm/expire the HUD flashes here, where the wall-clock `t` (ms) is known — the
    // sim only sets pending events. Splits linger ~2.5 s, the finish-delta ~5 s (#230).
    if (state.pendingSplit) {
      state.splitFlash = { ...state.pendingSplit, expiresAt: t + 2500 }
      state.pendingSplit = null
    }
    if (state.pendingFinish) {
      state.finishFlash = { ...state.pendingFinish, expiresAt: t + 5000 }
      state.pendingFinish = null
    }
    if (state.splitFlash && t >= state.splitFlash.expiresAt) state.splitFlash = null
    if (state.finishFlash && t >= state.finishFlash.expiresAt) state.finishFlash = null
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
