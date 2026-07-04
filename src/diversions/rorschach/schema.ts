import { z } from 'zod'

// Rorschach — a clean-room take on xscreensaver's `rorschach`. An organic inkblot
// grows on ONE side of a central axis, deposited by wandering "ink walkers", and is
// MIRRORED across that axis so both halves are perfect reflections (bilateral — the
// classic Rorschach — or four-fold). Each mark and its reflection are deposited
// together, so the blot is exactly symmetric by construction. The blot spreads
// outward over a few seconds, holds as a finished inkblot, dissolves, and reseeds a
// fresh blot — an endless zen loop. One schema drives the form, the URL codec, and
// the Config type. Two preset axes (Form / Ink) live in presets.ts.
export const rorschachSchema = z.object({
  // ─── Form ───────────────────────────────────────────────────────────────────
  symmetry: z.enum(['bilateral', 'quad']).default('bilateral')
    .meta({ section: 'Form', ui: 'segmented', options: ['bilateral', 'quad'],
            label: 'Symmetry',
            help: 'bilateral → a single vertical mirror, the classic Rorschach card · '
                + 'quad → mirrored top-to-bottom as well, a kaleidoscopic four-fold blot.' }),
  // ★ hero knob: independent walkers each grow a lobe, so more = a more many-armed blot.
  lobes: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'Form', ui: 'slider', min: 1, max: 8, step: 1, label: 'Complexity',
            help: 'How many ink walkers grow the blot at once. Each wanders its own path from '
                + 'the centre, so more walkers → a busier, more many-lobed inkblot; 1 → a single '
                + 'compact mass.' }),
  spread: z.number().min(0.15).max(1).default(0.5)
    .meta({ section: 'Form', ui: 'slider', min: 0.15, max: 1, step: 0.01, label: 'Spread',
            help: 'How far each walker hops between ink drops. Low = tight, dense, solid blobs; '
                + 'high = looser, reachier, more filamentary tendrils.' }),
  blotSize: z.number().min(0.4).max(0.95).default(0.72)
    .meta({ section: 'Form', ui: 'slider', min: 0.4, max: 0.95, step: 0.01, label: 'Size',
            help: 'How much of the frame the finished blot fills, as a fraction of the half-canvas.' }),

  // ─── Growth ─────────────────────────────────────────────────────────────────
  growthSpeed: z.number().min(0.3).max(3).default(1)
    .meta({ section: 'Growth', ui: 'slider', min: 0.3, max: 3, step: 0.1, label: 'Growth speed',
            help: 'How quickly the ink spreads to its full blot. 1 ≈ a five-second bloom; lower is a '
                + 'slower, more meditative accretion; higher forms it briskly.' }),
  holdSeconds: z.number().min(1).max(15).default(5)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 15, step: 0.5, label: 'Hold',
            help: 'Seconds the finished inkblot lingers, fully formed, before it dissolves and a new '
                + 'blot begins.' }),

  // ─── Ink ────────────────────────────────────────────────────────────────────
  edgeSoftness: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Ink', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Edge softness',
            help: '0 = crisp, bold silhouette with hard edges · higher = a softer, bleeding, '
                + 'watercolour edge. Keep it low for maximum contrast.' }),
  twoTone: z.boolean().default(false)
    .meta({ section: 'Ink', ui: 'toggle', label: 'Two-tone bleed',
            help: 'On: a faint accent colour bleeds around the ink at the edges, like a second '
                + 'pigment feathering into the paper.' }),
  blotColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#111014')
    .meta({ section: 'Ink', ui: 'color', label: 'Ink',
            help: 'The colour of the inkblot itself.' }),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8a1f2b')
    .meta({ section: 'Ink', ui: 'color', label: 'Accent',
            help: 'The bleed colour — only visible when Two-tone bleed is on.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#efe9dc')
    .meta({ section: 'Ink', ui: 'color', label: 'Background',
            help: 'The paper behind the blot. Classic cards are cream; err toward high contrast '
                + 'with the ink.' }),

  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed regrows the same sequence of blots. A fresh visit rolls '
                + 'a new one.' }),
})

export type RorschachConfig = z.infer<typeof rorschachSchema>
