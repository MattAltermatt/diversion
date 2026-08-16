import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'swirling-magic',
  title: 'Swirling Magic',
  description: 'Luminous kaleidoscopic ribbons braid and unwind around a slowly-turning centre, '
    + 'colour oozing through the spectrum and ghost-trails smearing behind — an homage to the '
    + 'After Dark swirl screensavers.',
  kind: '2d',
} as const satisfies DiversionMeta
