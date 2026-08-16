import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'pedal-rose',
  title: 'Pedal & Rose',
  description: 'A pen traces polar rose curves and their pedal curves — each symmetric '
    + 'bloom resolves, fades, and reseeds a fresh petal count in an endless loop.',
  kind: '2d',
} as const satisfies DiversionMeta
