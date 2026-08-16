import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'boxfit',
  title: 'Boxfit',
  description: 'Shapes drop on empty ground and grow until they touch — a tight, big-to-small '
    + 'mosaic that packs itself. After xscreensaver’s boxfit.',
  kind: '2d',
} as const satisfies DiversionMeta
