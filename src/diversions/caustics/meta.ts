import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'caustics',
  title: 'Caustics',
  description: 'Sunlight refracted through a pool surface, drifting over the tiled floor below.',
  kind: 'webgl',
} as const satisfies DiversionMeta
