import { z } from 'zod'
import { TARGET_KINDS } from './targets'

export const geneticImageSchema = z.object({
  polygonCount: z.number().int().min(3).max(30).default(10)
    .meta({ section: 'Genome', ui: 'slider', min: 3, max: 30, step: 1, label: 'Polygon count',
            help: 'How many translucent polygons make up the picture. Fewer = bold, abstract '
                + 'shapes; more = finer detail, but each generation takes longer to help.' }),
  verticesPerPolygon: z.number().int().min(3).max(8).default(4)
    .meta({ section: 'Genome', ui: 'slider', min: 3, max: 8, step: 1, label: 'Vertices per polygon',
            help: 'Corners on each polygon. 3 = triangles (angular); higher = rounder, blobbier shapes.' }),
  mutationsPerFrame: z.number().int().min(1).max(150).default(35)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 150, step: 1, label: 'Mutations / frame',
            help: 'Hill-climb attempts per animation frame. Higher = the picture resolves faster, '
                + 'at the cost of more work per frame.' }),
  target: z.enum(TARGET_KINDS).default('sunset')
    .meta({ section: 'Target', ui: 'segmented', options: [...TARGET_KINDS], label: 'Starting target',
            help: 'The first hidden picture the polygons evolve toward. Once a picture resolves '
                + 'and holds, it automatically fades and cycles to the next built-in target.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas color beneath the translucent polygons — also the fitness backdrop the '
                + 'polygons are scored against.' }),
  workingResolution: z.number().int().min(32).max(192).default(96)
    .meta({ section: 'Advanced', ui: 'slider', min: 32, max: 192, step: 8, label: 'Working resolution',
            help: 'Internal image size used to score how close a mutation is to the target. '
                + 'Higher = sharper fitness signal (finer detail) but slower evolution.' }),
  seed: z.number().int().default(4271)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            collapsed: true,
            help: 'Any integer. The same seed reproduces the exact same sequence of mutations. '
                + 'A fresh visit rolls a new one.' }),
})

export type GeneticImageConfig = z.infer<typeof geneticImageSchema>
