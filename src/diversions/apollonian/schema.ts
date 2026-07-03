import { z } from 'zod'

// Apollonian gasket — recursively pack mutually-tangent circles into every gap
// via the Descartes Circle Theorem. One schema drives the form, the URL codec,
// and the Config type. Two preset axes (Look, Structure) live in presets.ts.
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const apollonianSchema = z.object({
  // ─── Structure ───────────────────────────────────────────────────────────────
  // ★ hero knob: how deep the packing recurses = how many circles fill the gaps.
  detail: z.number().int().min(30).max(900).default(260)
    .meta({ section: 'Structure', ui: 'slider', min: 30, max: 900, step: 10, label: 'Detail',
            help: 'How small the tiniest circles get, relative to the boundary. Low = a few big '
                + 'circles, open gaps; high = the gaps fill with ever-finer circles down to specks. '
                + 'Changing this regrows the gasket.' }),

  // ─── Look ─────────────────────────────────────────────────────────────────────
  style: z.enum(['filled', 'rings', 'ink']).default('filled')
    .meta({ section: 'Look', ui: 'segmented', options: ['filled', 'rings', 'ink'], label: 'Style',
            help: 'filled → jewelled discs packing the boundary · rings → line-art outlines only · '
                + 'ink → single-colour silhouette.' }),
  lineWidth: z.number().min(0.4).max(4).default(1.4)
    .meta({ section: 'Look', ui: 'slider', min: 0.4, max: 4, step: 0.1, label: 'Line width',
            help: 'Stroke thickness for the ring outlines (rings style) and the outer boundary ring.' }),
  colorBy: z.enum(['depth', 'size']).default('depth')
    .meta({ section: 'Look', ui: 'segmented', options: ['depth', 'size'], label: 'Colour by',
            help: 'depth → shells of colour by recursion generation · size → colour tracks circle '
                + 'radius, so scale reads as a smooth gradient.' }),
  boundary: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Boundary ring',
            help: 'Stroke the outer bounding circle that contains the whole gasket.' }),
  glow: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft bloom around the packing. 0 = crisp, mineral; high = neon / stained glass. '
                + 'Costs a little framerate.' }),

  // ─── Color ─────────────────────────────────────────────────────────────────────
  background: hex6.default('#05060c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas colour behind the gasket.' }),
  colors: z.array(hex6).min(1).max(8)
    .default(['#4c2a95', '#8b39c0', '#d43f9a', '#ff6f5e', '#ffc84d', '#f5eeff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'In depth mode each recursion shell steps to the next colour (cycling); in size '
                + 'mode the palette ramps boundary → finest detail.' }),

  // ─── Motion ─────────────────────────────────────────────────────────────────────
  growthSpeed: z.number().min(0).max(3).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Growth speed',
            help: 'How fast the packing draws itself in, coarse circles first. 0 = appears fully '
                + 'formed; low = a slow, zen unfurling of finer and finer detail.' }),
  rotateSpeed: z.number().min(-0.4).max(0.4).default(0.05)
    .meta({ section: 'Motion', ui: 'slider', min: -0.4, max: 0.4, step: 0.01, label: 'Rotate speed',
            help: 'Slow rigid spin of the whole gasket. 0 = still; negative spins the other way.' }),

  seed: z.number().int().default(0)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Selects the seed family (symmetric, bilateral, and various integer '
                + 'gaskets) and rotation. Same seed → same gasket. A fresh visit rolls a new one.' }),
})

export type ApollonianConfig = z.infer<typeof apollonianSchema>
