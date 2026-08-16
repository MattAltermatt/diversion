import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'starfield',
  title: 'Starfield',
  description: 'Flying through space — stars streaming from a vanishing point, from a calm drift to a full hyperspace warp.',
  kind: '2d',
} as const satisfies DiversionMeta
