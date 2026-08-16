import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'hexadrop',
  title: 'Hexadrop',
  description: 'Raindrops on a hex pond: drops land at random cells and send concentric '
    + 'ripples across the lattice, brightening and recolouring each ring of hexes they pass. '
    + 'Overlapping ripples interfere into slow, shifting patterns.',
  kind: '2d',
} as const satisfies DiversionMeta
