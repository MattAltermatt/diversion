import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'braid',
  title: 'Braid',
  description: 'A glossy ring of coloured strands braiding over and under each other — a maypole plait bent into a '
    + 'torc, slowly rotating. The weave is a consistent braid-group interlace; a fresh braid is woven periodically.',
  kind: '2d',
} as const satisfies DiversionMeta
