// index.ts — framework wiring. Owns setup/frame/update/teardown/shouldRestart;
// delegates the restricted N-body to physics.ts and drawing to gl.ts. Auto-
// registers via the registry glob. kind:'webgl' → the host hands a WebGL2 context.
import { defineDiversion, type Size } from '../../framework/types'
import { hexToRgb } from '../../framework/color'
import { galaxyCollisionSchema, type GalaxyCollisionConfig } from './schema'
import { galaxyCollisionPresets } from './presets'
import { initSim, step, frameExtent, coreSeparation, INITIAL_SEP, type Sim, type PhysicsConfig } from './physics'
import { initGL, uploadColors, uploadPositions, render, disposeGL, type GalaxyGL, type View } from './gl'

interface State {
  gl: WebGL2RenderingContext // kept so teardown() (which gets no ctx) can free GL resources
  res: GalaxyGL
  sim: Sim
  cfg: GalaxyCollisionConfig
  scale: number // smoothed pixels-per-world (damped auto-fit)
  size: Size
  bgRgb: [number, number, number] // cached hexToRgb(cfg.background) — frame-invariant
}

// Sim-time pacing: how many sim-time units elapse per real second (a slow, zen
// encounter that fully plays out over ~50s), and the largest stable sub-step —
// the softened cores make near-core stars accelerate hard, so we cap dt and run
// several sub-steps per frame.
const TIME_PER_SEC = 0.3
const DT_MAX = 0.0016
// Staleness policy for the screensaver loop: reseed once the cores have clearly
// passed and flung apart, or after a hard time cap so a bound pair still loops.
const SEP_RESTART = 2.6 // × initial separation
const TIME_CAP = 16 // sim-time units

const toPhysics = (c: GalaxyCollisionConfig): PhysicsConfig => ({
  starCount: c.starCount, seed: c.seed, coreMass: c.coreMass, softening: c.softening,
  impactParameter: c.impactParameter, approachSpeed: c.approachSpeed, retrograde: c.retrograde,
})

/** pixels-per-world that fits `extent` (world radius) into the smaller screen half,
 *  with margin so tails have room to breathe. */
function targetScale(size: Size, extent: number): number {
  const minSide = Math.min(size.width, size.height)
  return (minSide * 0.42) / extent
}

const galaxyCollision = defineDiversion<typeof galaxyCollisionSchema, State, 'webgl'>({
  id: 'galaxy-collision',
  title: 'Galaxy Collision',
  description: 'Two spiral galaxies fall together and tidally shred each other — a restricted N-body of thousands of stars flung into tails, bridges, and shells as the cores pass, then reborn as a fresh encounter.',
  kind: 'webgl',
  schema: galaxyCollisionSchema,
  presets: galaxyCollisionPresets,

  setup(gl, cfg, size): State {
    const sim = initSim(toPhysics(cfg))
    const res = initGL(gl, sim.n)
    uploadColors(gl, res, sim, cfg.colorsA, cfg.colorsB)
    const bgRgb = hexToRgb(cfg.background)
    gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    // Start already framed so the first frame isn't zoomed wrong.
    const scale = targetScale(size, frameExtent(sim))
    return { gl, res, sim, cfg, scale, size, bgRgb }
  },

  frame(state, gl, _t, dt) {
    const { sim, res, cfg, size } = state
    // viewport must track the live backing store; resize()/teardown() don't get
    // the ctx, frame() does — set it here every frame (cheap, always-correct).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)

    // advance the sim: map wall-time to sim-time, split into stable sub-steps.
    const frameSim = Math.min(dt, 50) / 1000 * TIME_PER_SEC
    if (frameSim > 0) {
      const steps = Math.max(1, Math.min(8, Math.ceil(frameSim / DT_MAX)))
      const dtEach = frameSim / steps
      for (let i = 0; i < steps; i++) step(sim, dtEach)
    }

    // damped auto-fit: ease the smoothed scale toward the extent-fitting target so
    // the framing tracks the growing tails without jitter.
    const target = targetScale(size, frameExtent(sim))
    state.scale += (target - state.scale) * 0.03

    uploadPositions(gl, res, sim)
    const view: View = {
      centerX: 0, centerY: 0, // COM is pinned at the origin
      scale: state.scale,
      resW: gl.drawingBufferWidth,
      resH: gl.drawingBufferHeight,
      pointSize: cfg.pointSize,
      fade: Math.max(0.06, 1 - cfg.trailFade),
      bg: state.bgRgb,
    }
    render(gl, res, view)
  },

  // Reseed a fresh encounter once this one has played out (cores flung apart after
  // a real approach) or after a hard time cap — a forever screensaver loop.
  shouldRestart(state) {
    const { sim } = state
    const sep = coreSeparation(sim)
    // reseed once the cores have genuinely approached AND then flung far apart…
    const flungApart = sim.minSep < 0.9 * INITIAL_SEP && sep > SEP_RESTART * INITIAL_SEP
    // …or after a hard sim-time cap, so a tightly-bound pair still loops.
    return flungApart || sim.simTime > TIME_CAP
  },

  update(state, cfg, size): boolean {
    const prev = state.cfg
    // structural → false (re-setup re-seeds the whole encounter + resizes buffers)
    if (
      cfg.starCount !== prev.starCount ||
      cfg.seed !== prev.seed ||
      cfg.coreMass !== prev.coreMass ||
      cfg.softening !== prev.softening ||
      cfg.impactParameter !== prev.impactParameter ||
      cfg.approachSpeed !== prev.approachSpeed ||
      cfg.retrograde !== prev.retrograde
    ) return false

    state.cfg = cfg
    state.size = size
    // palette edits: recompute + re-upload the static colour texture live.
    if (cfg.colorsA !== prev.colorsA || cfg.colorsB !== prev.colorsB) {
      uploadColors(state.gl, state.res, state.sim, cfg.colorsA, cfg.colorsB)
    }
    if (cfg.background !== prev.background) state.bgRgb = hexToRgb(cfg.background)
    return true
  },

  resize(state, size) {
    state.size = size // world is viewport-independent; framing recomputes from size
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free programs, textures, VAO on diversion switch
  },
})

export default galaxyCollision
