import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { neuralCaSchema, type NeuralCaConfig } from './schema'
import { texturePresets } from './presets'
import { initGL, step, render, disposeGL, simGrid, stepSeed, type NeuralCaGL } from './gl'

type NeuralCaState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: NeuralCaGL
  cfg: NeuralCaConfig
  acc: number // fractional sim-step accumulator (speed = steps per frame)
  stepIdx: number // deterministic step counter → per-step seed is a pure fn of (cfg.seed, stepIdx)
}

// The "Texture" dropdown — one option per curated trained texture (drives the hidden `pattern`).
const presets: PresetGroup<NeuralCaConfig>[] = [
  { label: 'Texture', options: texturePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const neuralCa = defineDiversion<typeof neuralCaSchema, NeuralCaState, 'webgl'>({
  id: 'neural-ca',
  title: 'Neural CA',
  description:
    'A learned cellular automaton: each cell runs a tiny pretrained neural net over its hex neighbourhood, growing an endless churning texture. After Mordvintsev & Niklasson, Self-Organising Textures.',
  kind: 'webgl',
  schema: neuralCaSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    const n = simGrid(cfg.scale)
    return { gl, res: initGL(gl, n, cfg.seed | 0, cfg.pattern), cfg, acc: 0, stepIdx: 0 }
  },

  frame(state, gl, _t, _dt) {
    // Weights load async; until ready, step() is a no-op. Gate the accumulator too, or
    // stepIdx advances by a latency-dependent amount during load and the "same seed" grows
    // a different texture on a cold vs warm load (breaks the copy-link-with-seed keystone).
    if (!state.res.ready) {
      render(gl, state.res)
      return
    }
    // speed = sim steps per frame; accumulate so fractional speeds churn smoothly.
    state.acc += Math.max(0, state.cfg.speed)
    let budget = 8 // cap steps/frame so a long stall can't freeze the tab
    while (state.acc >= 1 && budget-- > 0) {
      // deterministic per-step seed → same cfg.seed reproduces the run (share-link keystone)
      step(gl, state.res, stepSeed(state.cfg.seed, state.stepIdx))
      state.stepIdx = (state.stepIdx + 1) % 1_000_000
      state.acc -= 1
    }
    if (state.acc > 1) state.acc = 1
    render(gl, state.res)
  },

  update(state, cfg) {
    // pattern/scale/seed are structural (reallocate GL / reload weights) → re-run setup; speed is
    // read live each frame, so it applies without a rebuild.
    const structural =
      cfg.pattern !== state.cfg.pattern || cfg.scale !== state.cfg.scale || cfg.seed !== state.cfg.seed
    state.cfg = cfg
    return !structural
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default neuralCa
