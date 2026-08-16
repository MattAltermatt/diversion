import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'crystal',
  title: 'Crystal',
  description: 'A seamless repeating wallpaper: a small coloured motif stamped across the plane by the exact symmetries of one of the 17 crystallographic groups, gently drifting and reseeding into a fresh group, motif, and palette.',
  kind: '2d',
} as const satisfies DiversionMeta
