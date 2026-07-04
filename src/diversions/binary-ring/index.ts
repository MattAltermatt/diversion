// Binary Ring — a glowing radial "horizon" of concentric rings whose arc segments
// are lit by an evolving BINARY pattern: each ring is its own little counter, so it
// literally counts up in binary (low segments blink fast, high ones drift slow) —
// a radial binary clock / rising sun. Adjacent rings counter-rotate and a warm
// chromatic haze blooms behind the disc. Clean-room take on xscreensaver
// `binaryring` (GH #101).
import { defineDiversion } from '../../framework/types'
import { binaryRingSchema } from './schema'
import {
  createBinaryRingState, stepBinaryRing, drawBinaryRing, updateBinaryRing,
  type BinaryRingState,
} from './binaryRing'
import { patternPresets, lookPresets } from './presets'

const binaryRing = defineDiversion<typeof binaryRingSchema, BinaryRingState, '2d'>({
  id: 'binary-ring',
  title: 'Binary Ring',
  description: 'Concentric rings count up in binary — arc segments pulse to an '
    + 'evolving bit pattern behind a warm rising-sun glow. A hypnotic radial clock.',
  kind: '2d',
  schema: binaryRingSchema,
  presets: [
    { label: 'Pattern', options: patternPresets },
    { label: 'Look', options: lookPresets },
  ],

  setup(ctx, config, size) {
    const state = createBinaryRingState(config, size.width, size.height)
    drawBinaryRing(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepBinaryRing(state, dt)
    drawBinaryRing(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    drawBinaryRing(state, ctx)
  },

  update(state, config, size) {
    return updateBinaryRing(state, config, size.width, size.height)
  },
})

export default binaryRing
