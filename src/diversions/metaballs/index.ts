import { defineDiversion, type Size } from '../../framework/types'
import { metaballsSchema, type MetaballsConfig } from './schema'
import { seedBlobs, stepBlobs, applyRadius, rescaleX, type Blob } from './motion'
import { initGL, render, disposeGL, type MetaballsGL } from './metaballs'
import { meta } from './meta'

type MetaballsState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: MetaballsGL
  cfg: MetaballsConfig
  blobs: Blob[]
  aspect: number // setup-time width/height; rescale blob X on resize
  t: number
}

const metaballs = defineDiversion<typeof metaballsSchema, MetaballsState, 'webgl'>({
  ...meta,
  schema: metaballsSchema,

  setup(gl, cfg, size: Size) {
    const aspect = size.width / size.height
    return { gl, res: initGL(gl), cfg, blobs: seedBlobs(cfg, aspect), aspect, t: 0 }
  },

  frame(state, gl, _t, dt) {
    // Viewport must track the live backing store; resize()/teardown() get no gl.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.t = stepBlobs(state.blobs, state.cfg, dt, state.t)
    render(gl, state.res, state.cfg, state.blobs)
  },

  resize(state, size) {
    // Keep blob X within the visible width when the aspect changes (resize /
    // fullscreen). u_res is set per-frame, but CPU positions need rescaling.
    const next = size.width / size.height
    rescaleX(state.blobs, state.aspect, next)
    state.aspect = next
  },

  update(state, cfg) {
    // blobCount/seed change the seeded blob *set* — but the GL program does NOT
    // depend on blob count (u_count is read live each frame, the uniform array is
    // fixed at MAX_BLOBS), so reseed the CPU blob set in place instead of falling
    // back to a full teardown + initGL (which would needlessly rebuild + flicker
    // the shader). Reseeding here also re-derives each blob's radius from cfg.
    if (cfg.blobCount !== state.cfg.blobCount || cfg.seed !== state.cfg.seed) {
      state.blobs = seedBlobs(cfg, state.aspect)
      state.cfg = cfg
      return true
    }
    // Radius bounds re-tune live from each blob's seeded fraction (no reseed).
    if (cfg.radiusMin !== state.cfg.radiusMin || cfg.radiusMax !== state.cfg.radiusMax) {
      applyRadius(state.blobs, cfg)
    }
    state.cfg = cfg // visual + motion params are read live each frame
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO on diversion switch
  },
})

export default metaballs
