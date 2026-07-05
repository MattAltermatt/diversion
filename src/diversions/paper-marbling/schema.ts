import { z } from 'zod'

// Paper Marbling (Ebru / Suminagashi) via exact closed-form marbling maths — drops push
// the plane radially, combs shear it, and the pattern is a pure composition of those maps
// (no fluid sim). One schema drives the form, the URL codec, and the Config type. Two preset
// axes (Pattern = recipe + rake tuning · Palette = inks + paper) live in presets.ts.
export const paperMarblingSchema = z.object({
  // ─── The Marbling ────────────────────────────────────────────────────────────
  pattern: z.enum(['concentric', 'drift', 'whirlpool', 'stylus', 'stone', 'nonpareil', 'feather', 'bouquet', 'getgel'])
    .default('concentric')
    .meta({ section: 'The Marbling', ui: 'segmented',
            options: ['concentric', 'drift', 'whirlpool', 'stylus', 'stone', 'nonpareil', 'feather', 'bouquet', 'getgel'],
            label: 'Pattern',
            help: 'How the inks are laid & mixed. concentric → drops fall on the same spot (with a '
                + 'little jitter), each pushing the last outward into rippling tree-rings · drift → '
                + 'inks keep dropping while a whirlpool or a single rake fires every so often · '
                + 'whirlpool → eddies appear one by one and swirl colours into spirals · stylus → a '
                + 'stick dragged through, one wavering line at a time · stone → dropped inks only · '
                + 'nonpareil → straight rake then a fine cross-rake (peacock grid) · feather → '
                + 'nonpareil then a close cross-rake into plumes · bouquet → rake drawn then back '
                + 'offset · getgel → a few large drops, one gentle rake.' }),
  // ★ hero knob: how many inks land before combing.
  dropCount: z.number().int().min(4).max(220).default(140)
    .meta({ section: 'The Marbling', ui: 'slider', min: 4, max: 220, step: 1, label: 'Drops',
            help: 'How many ink drops land on the size bath. Few = big open blooms on bare paper; '
                + 'many = the whole bath fills with ink (concentric builds deeper tree-rings; drift & '
                + 'the rakes get a richer field to shear).' }),
  dropSize: z.number().min(0.02).max(0.14).default(0.078)
    .meta({ section: 'The Marbling', ui: 'slider', min: 0.02, max: 0.14, step: 0.005, label: 'Drop size',
            help: 'Base radius of each ink drop (fraction of the sheet). Drops expand every existing '
                + 'colour outward to make room, so larger drops overwrite more of what came before.' }),
  combSpacing: z.number().min(0.03).max(0.3).default(0.08)
    .meta({ section: 'The Marbling', ui: 'slider', min: 0.03, max: 0.3, step: 0.005, label: 'Comb spacing',
            help: 'Gap between the rake teeth (fraction of the sheet). Tight spacing = many fine '
                + 'combed veins; wide = a few broad scallops.' }),
  combStrength: z.number().min(0.02).max(0.35).default(0.14)
    .meta({ section: 'The Marbling', ui: 'slider', min: 0.02, max: 0.35, step: 0.01, label: 'Comb pull',
            help: 'How far each rake drags the paint along its stroke. Higher = deeper, more '
                + 'dramatic combing; lower = a gentle waver.' }),
  sharpness: z.number().min(0.15).max(0.9).default(0.4)
    .meta({ section: 'The Marbling', ui: 'slider', min: 0.15, max: 0.9, step: 0.05, label: 'Comb sharpness',
            help: 'How quickly a tooth’s pull fades between teeth. High = crisp, tightly focused '
                + 'combed lines; low = soft, rounded scallops that blend across the gap.' }),
  mixChance: z.number().min(0).max(0.5).default(0.06)
    .meta({ section: 'The Marbling', ui: 'slider', min: 0, max: 0.5, step: 0.01, label: 'Mix chance',
            help: 'Drift only: the chance each new drop also triggers a random whirlpool or a single '
                + 'raked line. 0 = just drops piling up; higher = more frequent swirls and strokes '
                + 'stirring the sheet as it fills.' }),
  speed: z.number().min(0.1).max(3).default(0.1)
    .meta({ section: 'The Marbling', ui: 'slider', min: 0.1, max: 3, step: 0.1, label: 'Speed',
            help: 'How fast the sheet is made. Low = a slow, meditative bloom you can watch drop by '
                + 'drop; high = it marbles and refreshes more briskly.' }),

  // ─── Color ─────────────────────────────────────────────────────────────────
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(32)
    .default(['#14213d', '#9b1d20', '#e0a458', '#3b7080', '#5c8a72', '#8c4a6b', '#d97642', '#2a9d8f', '#e9c46a', '#f2e8cf'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Inks', min: 1, max: 32,
            help: 'The ink pots — up to 32. Concentric steps through them in order (rainbow rings); '
                + 'the others dye each drop from the list at random, newest painted on top.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f2ead6')
    .meta({ section: 'Color', ui: 'color', label: 'Paper',
            help: 'Colour of the size bath / paper showing through where no ink lands.' }),
  paperGrain: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Paper grain',
            help: 'Subtle fibrous mottling in the paper. 0 = flat colour; higher = more handmade, '
                + 'organic tone.' }),

  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed marbles the same sheet. A fresh visit rolls a new one.' }),
})

export type PaperMarblingConfig = z.infer<typeof paperMarblingSchema>
