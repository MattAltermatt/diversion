import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'maze',
  title: 'Maze',
  description: 'A perfect maze carves itself into being, then a solver floods through it and '
    + 'lights the path from entrance to exit — endlessly reseeding. After xscreensaver’s maze.',
  kind: '2d',
} as const satisfies DiversionMeta
