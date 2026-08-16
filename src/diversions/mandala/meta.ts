import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'mandala',
  title: 'Mandala',
  description: 'A jewel-toned kaleidoscopic mandala blooms itself into being — ring by ring of '
    + 'petals, lotus points and dots repeated in perfect N-fold symmetry — then holds, fades, '
    + 'and reseeds a fresh one, endlessly.',
  kind: '2d',
} as const satisfies DiversionMeta
