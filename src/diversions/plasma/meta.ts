import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'plasma',
  title: 'Plasma',
  description: 'Domain-warped color fields drifting across the screen — demoscene plasma.',
  kind: 'webgl',
} as const satisfies DiversionMeta
