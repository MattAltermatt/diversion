// schema.ts — single source of truth (config form + URL codec + Config type).
import { z } from 'zod'

export const chimeSchema = z.object({
  // ─── Field ──────────────────────────────────────────────────────────────────────
  nodeCount: z.number().int().min(12).max(400).default(130)
    .meta({ section: 'Field', ui: 'slider', min: 12, max: 400, step: 2, label: 'Wells',
            help: 'How many static wells fill the field. Each one fills with energy at its own '
                + 'pace and rings out when full. More wells means denser chatter and longer chains.' }),
  layout: z.enum(['even', 'scatter', 'grid']).default('even')
    .meta({ section: 'Field', ui: 'segmented', options: ['even', 'scatter', 'grid'], label: 'Layout',
            help: 'How the wells are placed. Even: loosely spaced (blue-noise) — organic but no clumps. '
                + 'Scatter: pure random, with clusters and voids. Grid: a jittered lattice, which lets '
                + 'the ripples build startlingly regular interference.' }),
  reach: z.number().min(0.15).max(1.6).default(1)
    .meta({ section: 'Field', ui: 'slider', min: 0.15, max: 1.6, step: 0.05, label: 'Max reach',
            help: 'How far a completely full well can throw its ripple, as a fraction of the screen '
                + 'diagonal. At 1 the biggest wells wash over the entire viewing area.' }),
  sizeSkew: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Field', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Reach variety',
            help: 'How unequal the wells are. 0 = every capacity equally likely. Higher = mostly '
                + 'small, quick wells with a few rare giants that take a long while to fill.' }),

  // ─── Rhythm ─────────────────────────────────────────────────────────────────────
  tempo: z.number().min(0.05).max(2).default(0.25)
    .meta({ section: 'Rhythm', ui: 'slider', min: 0.05, max: 2, step: 0.05, label: 'Tempo',
            help: 'How fast time runs for the whole piece — the one knob for “slower”. Charging, '
                + 'wave travel, refractory recovery and the wake all scale together, so the picture '
                + 'at any instant stays exactly the same and only the motion changes. Below 1 is '
                + 'slower; 0.05 is a glacial crawl where a single wavefront takes minutes to cross.' }),
  chargeSpeed: z.number().min(0.002).max(0.4).default(0.005)
    .meta({ section: 'Rhythm', ui: 'slider', min: 0.002, max: 0.4, step: 0.002, label: 'Charge speed',
            help: 'How fast wells fill, in energy per second (a full-size well holds 1). Low is slow '
                + 'and meditative; high turns the field into a boil.' }),
  rateSpread: z.number().min(0).max(1).default(0.45)
    .meta({ section: 'Rhythm', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Tempo spread',
            help: 'How much wells differ in fill rate. 0 = every well charges at the same speed '
                + '(regular, mechanical); higher scrambles the timing into something more alive.' }),
  refractory: z.number().min(0.1).max(20).default(6)
    .meta({ section: 'Rhythm', ui: 'slider', min: 0.1, max: 20, step: 0.1, label: 'Refractory',
            help: 'Seconds a well stays deaf after ringing — it ignores every passing wave until it '
                + 'recovers. This is what stops the field from screaming; keep it generous for calm.' }),

  // ─── Wave ───────────────────────────────────────────────────────────────────────
  waveSpeed: z.number().min(0.03).max(1.2).default(0.09)
    .meta({ section: 'Wave', ui: 'slider', min: 0.03, max: 1.2, step: 0.01, label: 'Wave speed',
            help: 'How fast a ripple expands, in screen-diagonals per second. Slow waves let you '
                + 'watch a cascade travel; fast ones snap across the field.' }),
  sensitivity: z.number().min(0).max(0.9).default(0.5)
    .meta({ section: 'Wave', ui: 'slider', min: 0, max: 0.9, step: 0.01, label: 'Trigger threshold',
            help: 'How strong a passing wave must be to set a well off. A ripple is at full strength '
                + 'at its source and fades to nothing at the edge of its reach — so a low threshold '
                + 'means even a spent wave can trigger a chain reaction, and a high one means only a '
                + 'close, powerful wave will.' }),
  depthShield: z.number().min(0).max(1).default(0.85)
    .meta({ section: 'Wave', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Depth resistance',
            help: 'How much harder a DEEP well is to disturb than a shallow one. At 0 every well '
                + 'answers the same threshold — which means the big wells are always tipped '
                + 'part-charged by the ambient chatter and a screen-wide release can never happen. '
                + 'Turn it up and the giants shrug off passing waves and only go off when they '
                + 'finally fill by themselves.' }),
  minCharge: z.number().min(0).max(0.9).default(0.3)
    .meta({ section: 'Wave', ui: 'slider', min: 0, max: 0.9, step: 0.01, label: 'Minimum charge',
            help: 'How full a well must be before a passing wave can tip it. A well always releases '
                + 'exactly the energy it has stored, so this sets the smallest ripple you will see.' }),

  // ─── Color ──────────────────────────────────────────────────────────────────────
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8)
    .default(['#2f6f9e', '#48b3cf', '#84e6e0', '#eafcff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 2, max: 8,
            help: 'The ramp a ripple is coloured along, first stop → last. What position along it a '
                + 'ripple takes is set by "Colour by".' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#04070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The still water the ripples cross. Keep it deep and dark so the wavefronts pop.' }),
  colorBy: z.enum(['energy', 'well', 'age']).default('energy')
    .meta({ section: 'Color', ui: 'segmented', options: ['energy', 'well', 'age'], label: 'Colour by',
            help: 'Energy: ripple colour tracks how much energy was released — small taps at the cool '
                + 'end, screen-wide events at the hot end. Well: every well keeps its own fixed colour, '
                + 'so you can follow who set off what. Age: each wavefront ramps through the palette as '
                + 'it expands, leaving a rainbow wake.' }),

  // ─── Look ───────────────────────────────────────────────────────────────────────
  wake: z.number().min(0.05).max(5).default(1.2)
    .meta({ section: 'Look', ui: 'slider', min: 0.05, max: 5, step: 0.05, label: 'Wake',
            help: 'Seconds of wake a wavefront leaves behind it before fading out. Short = a bare '
                + 'travelling edge; long = broad glowing swells that overlap into moiré.' }),
  frontWidth: z.number().min(0.5).max(6).default(1.8)
    .meta({ section: 'Look', ui: 'slider', min: 0.5, max: 6, step: 0.1, label: 'Front width',
            help: 'Thickness of the wave’s leading edge, in pixels. Thin reads as a crisp ring; '
                + 'thick reads as a rolling swell.' }),
  glow: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Glow',
            help: 'A soft halo carried alongside the leading edge. 0 is a bare hairline ring.' }),
  blend: z.enum(['add', 'layer']).default('add')
    .meta({ section: 'Look', ui: 'segmented', options: ['add', 'layer'], label: 'Blend',
            help: 'Add: crossing wavefronts sum and flare where they meet (interference). '
                + 'Layer: they simply paint over each other — flatter, more graphic.' }),
  nodeSize: z.number().min(0).max(6).default(2.2)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 6, step: 0.1, label: 'Well size',
            help: 'Radius of the well markers, in pixels — they brighten as they charge and flare '
                + 'when they release. Bigger wells are drawn bigger. 0 hides them entirely.' }),

  // ─── Advanced ───────────────────────────────────────────────────────────────────
  seed: z.number().int().default(11)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed lays out the same field of wells with the same '
                + 'capacities and tempos. A fresh visit rolls a new one.' }),
})

export type ChimeConfig = z.infer<typeof chimeSchema>
