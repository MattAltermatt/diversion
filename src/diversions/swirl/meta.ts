import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'swirl',
  title: 'Swirl',
  description: 'Luminous spiral knots — many fine spiral arms from a few drifting '
    + 'centres interweave into a slowly swirling, marbled nebula of jewel colour.',
  kind: '2d',
} as const satisfies DiversionMeta
