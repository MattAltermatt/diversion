import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'metaballs',
  title: 'Metaballs',
  description: 'Gooey blobs that rise, merge, and split — a lava lamp.',
  kind: 'webgl',
} as const satisfies DiversionMeta
