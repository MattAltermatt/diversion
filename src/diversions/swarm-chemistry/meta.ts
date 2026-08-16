import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'swarm-chemistry',
  title: 'Swarm Chemistry',
  description: 'Hiroki Sayama\'s EVOLUTIONARY Swarm Chemistry: every particle carries a kinetic recipe, and on collision the winning recipe is transmitted — with mutation — to the other. So the broth never settles. Recipes compete, spread and drift; structures coalesce, dissolve and reform forever, colour shifting as the genomes evolve. Start from a random Primordial Soup or seed one of Sayama\'s recipes. Scroll to zoom, drag to pan.',
  kind: 'webgpu',
} as const satisfies DiversionMeta
