// schema.ts — single source of truth (form + URL codec + Config type).
import { z } from 'zod'

export const forceGraphSchema = z.object({
  nodeCount: z.number().int().min(20).max(300).default(130)
    .meta({ section: 'Graph', ui: 'slider', min: 20, max: 300, step: 10, label: 'Nodes',
            help: 'How many vertices in the network. All-pairs repulsion is O(n²); 300 stays smooth on an M-series laptop.' }),
  graphType: z.enum(['tree', 'clusters', 'small-world']).default('clusters')
    .meta({ section: 'Graph', ui: 'segmented', options: ['tree', 'clusters', 'small-world'], label: 'Graph type',
            help: 'tree = a branching hierarchy that opens like a river delta · clusters = dense communities joined by a few bridges · small-world = a rewired ring (short paths, local cliques).' }),
  edgeDensity: z.number().min(0).max(1).default(0.14)
    .meta({ section: 'Graph', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Extra edges',
            help: 'Links added beyond the connected backbone. More = a denser tangle to untangle (and more crossings to resolve).' }),
  repulsion: z.number().min(0.1).max(2).default(0.6)
    .meta({ section: 'Forces', ui: 'slider', min: 0.1, max: 2, step: 0.05, label: 'Repulsion',
            help: 'Coulomb push (~1/d) between every pair of nodes — this is what spreads the graph out. Higher = airier layout.' }),
  springStiffness: z.number().min(0.05).max(2).default(0.6)
    .meta({ section: 'Forces', ui: 'slider', min: 0.05, max: 2, step: 0.05, label: 'Link tension',
            help: 'How hard each edge pulls its endpoints toward the link length. Higher = tighter, more crystalline; lower = loose and floppy.' }),
  springLength: z.number().min(10).max(120).default(55)
    .meta({ section: 'Forces', ui: 'slider', min: 10, max: 120, step: 5, label: 'Link length',
            help: 'Natural resting distance of a connected pair (layout units). Sets the overall scale before the frame auto-fits.' }),
  damping: z.number().min(0.6).max(0.97).default(0.85)
    .meta({ section: 'Forces', ui: 'slider', min: 0.6, max: 0.97, step: 0.01, label: 'Damping',
            help: 'Fraction of velocity kept each step. Lower settles faster but stiffer; higher drifts longer. Strong damping is what lets the tangle come to rest.' }),
  colorBy: z.enum(['community', 'degree']).default('community')
    .meta({ section: 'Look', ui: 'segmented', options: ['community', 'degree'], label: 'Colour by',
            help: 'community = each cluster gets its own hue · degree = hub nodes glow hot, leaves stay cool.' }),
  nodeSize: z.number().min(1.5).max(9).default(4)
    .meta({ section: 'Look', ui: 'slider', min: 1.5, max: 9, step: 0.5, label: 'Node size',
            help: 'Base disc radius in screen pixels. Nodes also grow with degree, so hubs read bigger.' }),
  edgeOpacity: z.number().min(0.03).max(0.8).default(0.22)
    .meta({ section: 'Look', ui: 'slider', min: 0.03, max: 0.8, step: 0.01, label: 'Link opacity',
            help: 'How bright the connecting lines are. Soft links keep the glowing nodes the star of the show.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6)
    .default(['#4cc9f0', '#f72585', '#ffd166', '#06d6a0', '#b5179e', '#ff7b54'])
    .meta({ section: 'Look', ui: 'colorList', min: 2, max: 6, label: 'Palette',
            help: 'Community hues (cycled) and the low→high ramp for degree colouring. Vivid + saturated pops against the dark.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#06080f')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'A near-black keeps the glowing nodes high-contrast.' }),
  speed: z.number().int().min(1).max(6).default(2)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 6, step: 1, label: 'Relax speed',
            help: 'Physics steps per frame — how fast you watch the untangling. Changes the pace, not the final layout.' }),
  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed + settings → the same graph and the same relaxation. A fresh visit rolls a new world.' }),
})

export type ForceGraphConfig = z.infer<typeof forceGraphSchema>
