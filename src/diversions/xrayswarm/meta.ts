import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'xrayswarm',
  title: 'X-Ray Swarm',
  description: 'Swarms of luminous agents chase their own wandering leader, each dragging a '
    + 'glowing, filament-thin trail that weaves and crosses into an X-ray tangle. A clean-room take '
    + 'on Chris Leger’s xscreensaver hack "xrayswarm", itself an homage to SGI’s "swarm" screensaver.',
  kind: '2d',
} as const satisfies DiversionMeta
