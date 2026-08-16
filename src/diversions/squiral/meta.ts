import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'squiral',
  title: 'Squiral',
  description: 'Worms crawl a grid, each winding itself into a tight square spiral until boxed in, '
    + 'flooding the screen with interlocking right-angled coils. After Jeff Epler’s Squiral (xscreensaver).',
  kind: '2d',
} as const satisfies DiversionMeta
