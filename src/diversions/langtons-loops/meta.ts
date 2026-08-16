import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'langtons-loops',
  title: "Langton's Loops",
  description: 'Christopher Langton’s self-reproducing loops (1984): a looped organism extends a '
    + 'construction arm and buds off copies, colonising the plane. After xscreensaver’s '
    + '“loop” by David Bagley.',
  kind: '2d',
} as const satisfies DiversionMeta
