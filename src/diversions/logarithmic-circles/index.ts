// Logarithmic Circles — an endless zoom through rings of black-and-white (or
// color) circles. Faithful WebGL port of mrange's CC0 Shadertoy "B/W logarithmic
// circles II" (xscreensaver `logarithmiccircles`). Credit: mrange + jwz/xscreensaver.
import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { logCirclesSchema, type LogCirclesConfig } from './schema'
import { initGL, render, disposeGL, advancePhase, type LogCirclesGL } from './shader'
import { lookPresets, motionPresets } from './presets'
import { meta } from './meta'

type LogCirclesState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: LogCirclesGL
  cfg: LogCirclesConfig
  zoomPhase: number
  rotPhase: number
}

const presets: PresetGroup<LogCirclesConfig>[] = [
  { label: 'Palette', options: lookPresets },
  { label: 'Motion', options: motionPresets },
]

const logCircles = defineDiversion<typeof logCirclesSchema, LogCirclesState, 'webgl'>({
  ...meta,
  schema: logCirclesSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, zoomPhase: 0, rotPhase: 0 }
  },

  frame(state, gl, _t, dt) {
    // Viewport must track the live backing store; resize()/teardown() get no ctx.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    const dir = state.cfg.direction === 'in' ? -1 : 1
    state.zoomPhase = advancePhase(state.zoomPhase, dir * state.cfg.zoomSpeed, dt)
    state.rotPhase = advancePhase(state.rotPhase, state.cfg.rotateSpeed, dt)
    render(gl, state.res, state.cfg, state.zoomPhase, state.rotPhase)
  },

  update(state, cfg) {
    state.cfg = cfg
    return true // every param is a uniform — always live, never re-setup
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default logCircles
