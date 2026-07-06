import { z } from 'zod'

// Hypercube / Tesseract — a glowing 4-D wireframe endlessly turning inside-out through
// the fourth dimension: the small inner cube swells to become the outer cube and back.
// One Zod object is the single source of truth for the config form, the URL codec, and
// the Config type. Every field carries .meta({ ui, label, ... }); sliders always carry
// min+max+step (UX invariant #4).
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const hypercubeSchema = z.object({
  // ─── Shape ─────────────────────────────────────────────────────────────────────
  polytope: z.enum(['tesseract', 'sixteen-cell', 'penteract']).default('tesseract')
    .meta({ section: 'Shape', ui: 'segmented',
            options: ['tesseract', 'sixteen-cell', 'penteract'], label: 'Polytope',
            help: 'Tesseract: the 4-cube (16 corners, 32 edges). 16-cell: its dual '
                + '(8 corners, 24 edges), a 4-D octahedron. Penteract: the 5-cube — a '
                + 'whole extra dimension folding through.' }),

  // ─── Rotation ──────────────────────────────────────────────────────────────────
  // Speeds are radians/second (frame-rate independent). The XW/YW/ZW planes involve
  // the 4th axis — these are the ones that produce the hypnotic inside-out turning.
  speedXW: z.number().min(0).max(1.2).default(0.22)
    .meta({ section: 'Rotation', ui: 'slider', min: 0, max: 1.2, step: 0.01, label: 'Spin X–W',
            help: 'Rotation through the fourth dimension in the X–W plane — the main '
                + 'inside-out turn. The primary hypnotic lever.' }),
  speedYW: z.number().min(0).max(1.2).default(0.13)
    .meta({ section: 'Rotation', ui: 'slider', min: 0, max: 1.2, step: 0.01, label: 'Spin Y–W',
            help: 'A second 4-D rotation in the Y–W plane. Combine with X–W for a '
                + 'richer tumble.' }),
  speedZW: z.number().min(0).max(1.2).default(0)
    .meta({ section: 'Rotation', ui: 'slider', min: 0, max: 1.2, step: 0.01, label: 'Spin Z–W',
            help: 'A third 4-D rotation in the Z–W plane. 0 = off. Adding it makes the '
                + 'motion less predictable.' }),
  spin3D: z.number().min(0).max(1.2).default(0.09)
    .meta({ section: 'Rotation', ui: 'slider', min: 0, max: 1.2, step: 0.01, label: 'Spin 3-D',
            help: 'An ordinary 3-D tumble (the X–Z plane) laid over the 4-D rotation, so '
                + 'the whole form turns in depth as well.' }),

  // ─── Projection ──────────────────────────────────────────────────────────────────
  proj4Distance: z.number().min(2.6).max(8).default(3.6)
    .meta({ section: 'Projection', ui: 'slider', min: 2.6, max: 8, step: 0.1, label: '4-D distance',
            help: 'Camera distance for the 4-D → 3-D projection. Low = dramatic '
                + 'foreshortening and a big inner/outer size gap; high = flatter, gentler.' }),
  proj3Distance: z.number().min(2.4).max(8).default(3.4)
    .meta({ section: 'Projection', ui: 'slider', min: 2.4, max: 8, step: 0.1, label: '3-D distance',
            help: 'Camera distance for the final 3-D → 2-D projection. Sets how strongly '
                + 'near edges loom larger than far ones.' }),
  zoom: z.number().min(0.3).max(2.5).default(1)
    .meta({ section: 'Projection', ui: 'slider', min: 0.3, max: 2.5, step: 0.05, label: 'Zoom',
            help: 'Overall on-screen size of the wireframe.' }),

  // ─── Style ───────────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(0.6).max(4).default(1.8)
    .meta({ section: 'Style', ui: 'slider', min: 0.6, max: 4, step: 0.1, label: 'Line width',
            help: 'Thickness of the bright core stroke (px) for the nearest edges. Far '
                + 'edges taper thinner to read depth.' }),
  glow: z.number().min(0).max(0.6).default(0.28)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Glow',
            help: 'Opacity of the soft halo drawn under each edge, giving the wireframe a '
                + 'luminous bloom. 0 = plain hairlines.' }),
  vertices: z.boolean().default(true)
    .meta({ section: 'Style', ui: 'toggle', label: 'Corner dots',
            help: 'Draw a small glowing dot at each corner, brighter when nearer.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────────
  colorMode: z.enum(['depth', 'single', 'spectrum']).default('depth')
    .meta({ section: 'Color', ui: 'segmented', options: ['depth', 'single', 'spectrum'],
            label: 'Color mode',
            help: 'Depth: edges blend from a far color to a near color by distance. '
                + 'Single: one color, brightness by depth. Spectrum: each edge a '
                + 'different hue around the wheel.' }),
  nearColor: hex6.default('#6cf0ff')
    .meta({ section: 'Color', ui: 'color', label: 'Near color',
            help: 'Color of the nearest edges (and the single-color mode).' }),
  farColor: hex6.default('#2340b8')
    .meta({ section: 'Color', ui: 'color', label: 'Far color',
            showWhen: { field: 'colorMode', equals: 'depth' },
            help: 'Color of the most distant edges; the wireframe blends toward the near '
                + 'color as edges approach.' }),
  background: hex6.default('#04050c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The deep ground the luminous wireframe is drawn on. Keep it dark for '
                + 'contrast (UX invariant #5).' }),

  // ─── Advanced ──────────────────────────────────────────────────────────────────
  seed: z.number().int().default(4104)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the initial orientation and a subtle per-plane speed '
                + 'jitter, so the same seed reproduces the same turning. A fresh visit '
                + 'rolls a new one.' }),
})

export type HypercubeConfig = z.infer<typeof hypercubeSchema>
