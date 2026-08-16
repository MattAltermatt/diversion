import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'pinion',
  title: 'Pinion',
  description: 'A connected train of interlocking gears turning in perfect mesh — '
    + 'teeth dropping cleanly into gaps, brass and jewel wheels of many sizes spinning '
    + 'a hypnotic clockwork.',
  kind: '2d',
} as const satisfies DiversionMeta
