import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'aurora',
  title: 'Aurora Curtains',
  description: 'Draping ribbons of light sway and reform across a deep night sky — a slow, meditative aurora borealis.',
  kind: 'webgl',
} as const satisfies DiversionMeta
