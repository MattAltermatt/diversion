import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'hypercube',
  title: 'Hypercube',
  description: 'A glowing 4-D wireframe tesseract endlessly turning inside-out through the '
    + 'fourth dimension — the inner cube swelling to become the outer and back. Also a '
    + '16-cell and a 5-cube.',
  kind: '2d',
} as const satisfies DiversionMeta
