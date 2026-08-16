import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'turmite',
  title: 'Turmite',
  description: 'A generalized Langton’s ant: ants turn by the colour beneath them, leaving emergent highways, spirals, and fractal growth.',
  kind: '2d',
} as const satisfies DiversionMeta
