import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'map-creator',
  title: 'Map Creator',
  description: 'A fantasy continent draws itself into being on parchment — sea, then ink '
    + 'coastlines, biomes washing in by elevation, and rivers finding their way to the sea — '
    + 'before the finished map dissolves and a fresh world begins.',
  kind: '2d',
} as const satisfies DiversionMeta
