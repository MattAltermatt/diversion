import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'cwaves',
  title: 'Colour Waves',
  description: 'Several drifting cosine gratings superimpose into smooth, ever-reorganizing ribbons of colour — like silk or an aurora.',
  kind: 'webgl',
} as const satisfies DiversionMeta
