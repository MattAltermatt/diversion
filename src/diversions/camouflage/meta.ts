import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'camouflage',
  title: 'Camouflage',
  description: 'Moths evolve to vanish into a textured background while a predator sharpens its eye to find them — watch a whole population sink into the pattern, generation by generation.',
  kind: '2d',
} as const satisfies DiversionMeta
