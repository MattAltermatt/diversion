import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'vermiculate',
  title: 'Vermiculate',
  description: 'Turtle worms crawl the plane, their turning rate drifting step by step, tracing a '
    + 'wormy tangle like the winding galleries worms leave under bark. After Jamie Zawinski and '
    + 'David Konerding’s Vermiculate (xscreensaver).',
  kind: '2d',
} as const satisfies DiversionMeta
