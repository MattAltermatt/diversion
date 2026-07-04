// index.ts — framework wiring. Owns setup/frame/update/resize/shouldRestart;
// delegates graph gen + layout physics to graph.ts and drawing to render.ts.
import { defineDiversion } from '../../framework/types'
import { forceGraphSchema } from './schema'
import {
  createLayout, stepLayout, updateView, settleThreshold, type LayoutState,
} from './graph'
import { renderGraph } from './render'

// Once the layout has come to rest and held this long, the piece reseeds a fresh
// graph that untangles again — the right unattended-screensaver loop.
const SETTLE_HOLD_MS = 9000
// Hard fallback so a fidgety graph that never fully settles still reseeds.
const MAX_STEPS = 6000

const forceGraph = defineDiversion<typeof forceGraphSchema, LayoutState, '2d'>({
  id: 'force-graph',
  title: 'Force-Directed Graph',
  description: 'A knotted tangle of nodes and links springs apart — communities bloom into clusters and settle into an elegant network, then reseeds.',
  kind: '2d',
  schema: forceGraphSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createLayout(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const steps = Math.max(1, state.cfg.speed)
    for (let i = 0; i < steps; i++) stepLayout(state)
    updateView(state, dt)
    renderGraph(state, ctx as CanvasRenderingContext2D)

    // track settle (absolute, link-length-relative threshold — not screen-proportional)
    if (state.meanSpeed < settleThreshold(state.cfg)) state.settledMs += dt
    else state.settledMs = 0
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    // layout is viewport-independent; autofit re-frames from the new size
  },

  update(state, config, size) {
    // structural (topology / count / seed) → re-setup rebuilds the graph
    if (config.nodeCount !== state.cfg.nodeCount ||
        config.graphType !== state.cfg.graphType ||
        config.edgeDensity !== state.cfg.edgeDensity ||
        config.seed !== state.cfg.seed) return false
    // everything else (forces, look, speed) reads live from state.cfg
    state.cfg = config
    state.w = size.width
    state.h = size.height
    return true
  },

  shouldRestart(state) {
    return state.settledMs >= SETTLE_HOLD_MS || state.step >= MAX_STEPS
  },
})

export default forceGraph
