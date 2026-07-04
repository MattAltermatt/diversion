import { defineDiversion } from '../../framework/types'
import { sphFluidSchema, type SphFluidConfig } from './schema'
import {
  createFluid, resizeFluid, stepFluid, BOX_H, type Fluid, type SphParams,
} from './sph'
import { createRenderState, renderFluid, type RenderState } from './render'

// Slider [0..1] → physics ranges. Chosen so the schema defaults land on a deep,
// calm, glossy pool (g≈140, k≈54000, μ≈33) — the headline look — while the
// extremes stay bounded (the velocity clamp in sph.ts is the hard safety net).
const lerp = (t: number, a: number, b: number) => a + (b - a) * t
const G_MIN = 40, G_MAX = 240
const K_MIN = 8000, K_MAX = 100000
const MU_MIN = 3, MU_MAX = 90
const TILT_MAX = 0.7 // max gravity tilt (radians, ~40°) at full slosh
const SLOSH_BASE = (Math.PI * 2) / 9 // slosh angular freq at sloshSpeed=1 (9s period)

/** Map the config's 0..1 feel sliders + the slosh clock onto SPH params. */
export function deriveParams(cfg: SphFluidConfig, tSeconds: number): SphParams {
  const amp = cfg.sloshAmount * TILT_MAX
  const tiltAngle = amp * Math.sin(tSeconds * cfg.sloshSpeed * SLOSH_BASE)
  return {
    stiffness: lerp(cfg.stiffness, K_MIN, K_MAX),
    viscosity: lerp(cfg.viscosity, MU_MIN, MU_MAX),
    gravity: lerp(cfg.gravity, G_MIN, G_MAX),
    tiltAngle,
  }
}

interface SphState {
  fluid: Fluid
  render: RenderState
  cfg: SphFluidConfig
  t: number // elapsed seconds (drives the slosh clock)
  w: number
  h: number
}

const sphFluid = defineDiversion<typeof sphFluidSchema, SphState, '2d'>({
  id: 'sph-fluid',
  title: 'SPH Fluid',
  description: 'A body of liquid that pools, sloshes and splashes in a tilting tank.',
  kind: '2d',
  schema: sphFluidSchema,

  setup(ctx, cfg, size) {
    const boxW = BOX_H * (size.width / size.height)
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
    return {
      fluid: createFluid(cfg.particleCount, cfg.seed, boxW, BOX_H),
      render: createRenderState(),
      cfg,
      t: 0,
      w: size.width,
      h: size.height,
    }
  },

  frame(state, ctx, _t, dt) {
    state.t += dt / 1000
    const params = deriveParams(state.cfg, state.t)
    stepFluid(state.fluid, params, dt)
    renderFluid(state.render, ctx, state.fluid, state.cfg, state.w, state.h)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    resizeFluid(state.fluid, BOX_H * (size.width / size.height), BOX_H)
  },

  update(state, cfg) {
    // Particle count + seed re-pour the tank (structural) → full re-setup.
    if (cfg.particleCount !== state.cfg.particleCount || cfg.seed !== state.cfg.seed) return false
    // Everything else (feel sliders, colours, render mode) is read live per frame.
    state.cfg = cfg
    return true
  },
})

export default sphFluid
