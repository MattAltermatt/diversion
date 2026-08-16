import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'dla',
  title: 'Diffusion-Limited Aggregation',
  description: 'Wandering dust freezes on contact, assembling a fractal dendrite — frost, coral, lightning.',
  kind: '2d',
} as const satisfies DiversionMeta
