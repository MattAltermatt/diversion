import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'demon',
  title: 'Demon',
  description: 'A cyclic cellular automaton: each cell is eaten by the next color in a ring, '
    + 'and rotating spiral “demons” self-organize out of pure noise. After David Griffeath’s '
    + 'cyclic CA (xscreensaver’s demon).',
  kind: '2d',
} as const satisfies DiversionMeta
