import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { gpuFluidSchema, type GpuFluidConfig } from './schema'
import { initGL, render, injectBlob, disposeGL, type FluidGL } from './gl'
import { flowPresets, palettePresets } from './presets'
import { meta } from './meta'

type GpuFluidState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: FluidGL
  cfg: GpuFluidConfig
  injectAcc: number // fractional blob-injection carry (blobs due this frame)
}

// Two independent preset axes (like Gray-Scott). Flow patches the motion knobs;
// Palette patches the injected dye colors. Seed / resolution / advanced stay
// user-controlled, outside both groups.
const presets: PresetGroup<GpuFluidConfig>[] = [
  { label: 'Flow', options: flowPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const gpuFluid = defineDiversion<typeof gpuFluidSchema, GpuFluidState, 'webgl'>({
  ...meta,
  schema: gpuFluidSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg, injectAcc: 0 }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    // Schedule injections in real time so the field stays alive with no input.
    // dt is ms; injectionRate is blobs/second. Cap the per-frame catch-up so a
    // long tab-throttle stall can't dump hundreds of blobs in one frame.
    state.injectAcc += (dt / 1000) * state.cfg.injectionRate
    let budget = 4
    while (state.injectAcc >= 1 && budget-- > 0) {
      injectBlob(gl, state.res, state.cfg)
      state.injectAcc -= 1
    }
    if (state.injectAcc > 1) state.injectAcc = 1
    render(gl, state.res, state.cfg, dt)
  },

  // resize is a no-op: the display pass samples the dye field in normalized UV
  // and always fills the screen, so window/fullscreen resizes keep the sim field
  // at its setup-time size (no reallocation / reseed).

  update(state, cfg) {
    // Structural changes need a fresh field: a new seed (different blob stream)
    // or a resolution change (different texture sizes) → full teardown + setup.
    if (cfg.seed !== state.cfg.seed || cfg.resolution !== state.cfg.resolution) return false
    // Everything else (curl, dissipation, pressureIters, injectionRate, simSpeed,
    // stops) is a per-frame uniform or JS-side value — applied live.
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default gpuFluid
