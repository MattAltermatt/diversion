import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'genetic-image',
  title: 'Genetic Image Evolution',
  description: 'Translucent polygons hill-climb toward a hidden picture, generation by generation.',
  kind: '2d',
} as const satisfies DiversionMeta
