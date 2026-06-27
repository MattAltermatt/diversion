import { z } from 'zod'

export const metaballsSchema = z.object({
  blobCount: z.number().int().min(3).max(16).default(8)
    .meta({ ui: 'slider', min: 3, max: 16, step: 1, label: 'Blob count',
            help: 'How many blobs. More = busier, more merges.' }),
  radiusMin: z.number().min(0.02).max(0.2).default(0.06)
    .meta({ ui: 'slider', min: 0.02, max: 0.2, step: 0.005, label: 'Radius min',
            help: 'Smallest blob size (fraction of the short screen dimension).' }),
  radiusMax: z.number().min(0.05).max(0.4).default(0.16)
    .meta({ ui: 'slider', min: 0.05, max: 0.4, step: 0.005, label: 'Radius max',
            help: 'Largest blob size (fraction of the short screen dimension).' }),
  threshold: z.number().min(0.5).max(3).default(1.0)
    .meta({ ui: 'slider', min: 0.5, max: 3, step: 0.05, label: 'Threshold',
            help: 'Blob fatness — lower = fatter, merges more readily.' }),
  edgeSoftness: z.number().min(0).max(0.3).default(0.06)
    .meta({ ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Edge softness',
            help: 'Rim softness — higher = blurrier, more gooey edges.' }),
  buoyancy: z.number().min(0).max(1).default(0.4)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Buoyancy',
            help: 'Strength of the vertical rise/fall thermal cycle.' }),
  viscosity: z.number().min(0).max(1).default(0.6)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Viscosity',
            help: 'How slowly blobs move and merge. Higher = thicker, syrupy.' }),
  glow: z.number().min(0).max(1).default(0.3)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft halo around each blob. Bounded to avoid white-out.' }),
  speed: z.number().min(0).max(2).default(0.6)
    .meta({ ui: 'slider', min: 0, max: 2, step: 0.01, label: 'Speed',
            help: 'Overall pace of the motion. 0 = frozen.' }),
  seed: z.number().int().default(1742)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same arrangement.' }),
  colorA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff2e63')
    .meta({ ui: 'color', label: 'Rim color' }),
  colorB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd56b')
    .meta({ ui: 'color', label: 'Core color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ ui: 'color', label: 'Background' }),
})

export type MetaballsConfig = z.infer<typeof metaballsSchema>
