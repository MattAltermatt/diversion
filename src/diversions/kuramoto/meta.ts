import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'kuramoto',
  title: 'Kuramoto',
  description: 'A field of coupled oscillators, each a spinning phase, pulls itself into step — synchronized domains of one colour spreading and colliding, with rotating phase defects swirling through the spectrum at their seams.',
  kind: 'webgl',
} as const satisfies DiversionMeta
