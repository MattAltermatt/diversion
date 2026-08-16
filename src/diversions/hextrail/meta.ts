import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'hextrail',
  title: 'Hextrail',
  description: 'Glowing arms branch outward along a hex lattice, fill the field, '
    + 'then dissolve and begin again. After xscreensaver’s hextrail by jwz.',
  kind: '2d',
} as const satisfies DiversionMeta
