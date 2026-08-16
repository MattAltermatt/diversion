import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'brians-brain',
  title: 'Brian’s Brain',
  description: 'Two excitable cellular automata by Brian Silverman. Brian’s Brain — cells wake, '
    + 'flash, and die by their neighbours, spawning endless diagonal spaceships that stream across '
    + 'a dark field and never settle. Switch rules for Wireworld, where electron heads and tails '
    + 'race along the conductive filaments that thread through the field.',
  kind: '2d',
} as const satisfies DiversionMeta
