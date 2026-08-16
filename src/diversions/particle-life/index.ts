// index.ts — framework wiring. Owns setup/frame/update/resize/teardown; delegates the
// sim to sim.ts and drawing to render.ts. Auto-registers via the registry glob.
import { defineDiversion, type Size } from '../../framework/types'
import { particleLifeSchema, type ParticleLifeConfig } from './schema'
import { particleLifePresets } from './presets'
import { createSim, stepSim, rebuildMatrix, rebuildGrid, type Sim, type SimConfig } from './sim'
import { drawScene, buildSprites, type GlowSprites } from './render'
import { paletteColors, type PaletteName } from './palette'
import { createStallState, meanSpeed2, tickStall, type StallState } from './restart'
import { meta } from './meta'

interface State {
  sim: Sim
  sprites: GlowSprites
  cfg: ParticleLifeConfig
  size: Size
  acc: number // fractional sim-step accumulator → lets speed drop below 1× (slow motion)
  stall: StallState // auto-restart: reseeds a fresh world once the broth stops moving
}

const toSimConfig = (c: ParticleLifeConfig): SimConfig => ({
  count: c.count, colors: c.colors, seed: c.seed, rMax: c.rMax, beta: c.beta,
  forceScale: c.forceScale, friction: c.friction, symmetry: c.symmetry, attractBias: c.attractBias,
})

const makeSprites = (c: ParticleLifeConfig): GlowSprites =>
  buildSprites(paletteColors(c.palette as PaletteName, c.colors), c.dotSize, c.glow)

const particleLife = defineDiversion({
  ...meta,
  schema: particleLifeSchema,
  presets: particleLifePresets,

  setup(_ctx, cfg, size): State {
    return { sim: createSim(toSimConfig(cfg)), sprites: makeSprites(cfg), cfg, size, acc: 0, stall: createStallState() }
  },

  // Auto-restart: once the broth stops moving (frozen crystal / motionless clump),
  // the mean kinetic energy stays near zero — reseed a fresh world. A single creature
  // that zooms forever keeps its energy up, so it's deliberately left alone.
  shouldRestart(state, _t, dt): boolean {
    return tickStall(state.stall, dt, meanSpeed2(state.sim.vx, state.sim.vy, state.sim.n))
  },

  frame(state, ctx, _t, _dt) {
    // fixed-dt steps paced by speed: accumulate fractional steps and run the whole
    // ones this frame (speed < 1 → some frames advance 0 steps = slow motion; the
    // step sequence is unchanged, so the outcome never depends on speed).
    state.acc += state.cfg.speed
    const steps = Math.floor(state.acc)
    state.acc -= steps
    for (let i = 0; i < steps; i++) stepSim(state.sim)
    drawScene(ctx as CanvasRenderingContext2D, state.sim, state.cfg, state.size, state.sprites)
  },

  resize(state, size) {
    state.size = size // world is fixed; render recomputes the cover-fit from size
  },

  update(state, cfg, size): boolean {
    const prev = state.cfg
    // structural → false (re-setup reseeds positions/species + resizes arrays)
    if (cfg.count !== prev.count || cfg.colors !== prev.colors || cfg.seed !== prev.seed) return false

    state.cfg = cfg
    state.size = size
    Object.assign(state.sim.cfg, toSimConfig(cfg))

    if (cfg.symmetry !== prev.symmetry || cfg.attractBias !== prev.attractBias) rebuildMatrix(state.sim)
    if (cfg.rMax !== prev.rMax) rebuildGrid(state.sim)
    if (cfg.palette !== prev.palette || cfg.dotSize !== prev.dotSize || cfg.glow !== prev.glow) {
      state.sprites = makeSprites(cfg)
    }
    return true
  },

  teardown(state) {
    // release the SoA arrays + sprite canvases for GC (nothing GPU in 2D)
    ;(state as unknown as { sim: null; sprites: null }).sim = null
    ;(state as unknown as { sim: null; sprites: null }).sprites = null
  },
})

export default particleLife
