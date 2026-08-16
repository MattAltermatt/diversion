import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'falling-sand',
  title: 'Falling Sand',
  description: 'A powder-toy chamber that pours itself — sand piles at its angle of repose, water finds its level, and fire climbs and consumes drifting plant, while wandering spouts keep the chamber endlessly filling and draining.',
  kind: '2d',
} as const satisfies DiversionMeta
