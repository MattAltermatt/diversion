import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'hopalong',
  title: 'Hopalong',
  description: 'Barry Martin\'s Hopalong map, plotted as a log-density caustic. '
    + 'After xscreensaver\'s hopalong (Patrick J. Naughton / Barry Martin / Ed Kubaitis / '
    + 'Renaldo Recuerdo).',
  kind: '2d',
} as const satisfies DiversionMeta
