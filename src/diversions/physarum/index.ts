import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { physarumSchema, type PhysarumConfig } from './schema'
import { initGL, render, step, uploadLUT, disposeGL, type PhysarumGL } from './gl'
import { behaviorPresets, colorPresets } from './presets'

type PhysarumState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: PhysarumGL
  cfg: PhysarumConfig
}

// Two independent preset axes (like Flow Field). A Behavior option patches the
// morphology fields; a Color option patches the density gradient. Agents/speed/
// seed stay user-controlled, outside both groups.
const presets: PresetGroup<PhysarumConfig>[] = [
  { label: 'Behavior', options: behaviorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Color', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const physarum = defineDiversion<typeof physarumSchema, PhysarumState, 'webgl'>({
  id: 'physarum',
  title: 'Physarum',
  description: 'Slime-mold agents grow and rewire luminous transport networks.',
  kind: 'webgl',
  schema: physarumSchema,

  setup(gl, cfg, size: Size) {
    const res = initGL(gl, cfg, size.width, size.height)
    // Under prefers-reduced-motion (#39) the host paints one frozen frame, which
    // would otherwise be a flat near-black field (the organism hasn't grown yet).
    // Pre-warm the sim so that single frame shows the resolved slime-mold network.
    // Gated on the media query so the normal animated view keeps its full
    // grow-from-black opening. frame() resets the viewport each tick, so the GL
    // state the pre-warm leaves behind is harmless.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      for (let i = 0; i < 150; i++) step(gl, res, cfg)
    }
    return { gl, res, cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg, state.cfg.speed)
  },

  // resize is a no-op: the display pass samples the trail in normalized UV and
  // always fills the screen, so the organism survives window/fullscreen resizes
  // without reallocation or reseed. (Trail texture keeps its setup-time size.)

  update(state, cfg) {
    // Structural changes need fresh textures → fall back to teardown + setup.
    if (cfg.agents !== state.cfg.agents || cfg.seed !== state.cfg.seed) return false
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true // all remaining params are per-step uniforms
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default physarum
