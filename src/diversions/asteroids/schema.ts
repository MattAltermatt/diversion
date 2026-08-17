import { z } from 'zod'

export const PAN_MODES = ['Drift', 'Pan'] as const

// Homeworld purple→blue nebula stops, ordered dark→light so LUT interpolation
// stays on-palette (anchor-ramp gotcha).
const HOMEWORLD = ['#1a1440', '#2a1a4a', '#3a2260', '#22407a', '#2e6a8a']

export const asteroidsSchema = z.object({
  // ── Nebula ──
  cloudScale: z.number().min(0.4).max(3).default(1.1)
    .meta({ section: 'Nebula', ui: 'slider', min: 0.4, max: 3, step: 0.05, label: 'Cloud scale',
            help: 'Feature size of the nebula clouds. Lower = broader, calmer regions.' }),
  wispiness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Nebula', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Wispiness',
            help: 'How much fine detail rides on the soft base — the visible cloud structure.' }),
  contrast: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Nebula', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Contrast',
            help: 'Punch of the color field. Low = soft painterly gradient; high = defined banks.' }),
  dustLanes: z.number().min(0).max(1).default(0.7)
    .meta({ section: 'Nebula', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Dust lanes',
            help: 'Dark dust that drifts across the field and veils the sun, so the light filters '
                + 'through gaps instead of blazing clean. The main source of atmosphere.' }),
  // ── Light ──
  sunX: z.number().min(0).max(1).default(0.78)
    .meta({ section: 'Light', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Sun X',
            help: 'Horizontal position of the light source (0 = left, 1 = right).' }),
  sunY: z.number().min(0).max(1).default(0.32)
    .meta({ section: 'Light', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Sun Y',
            help: 'Vertical position of the light source (0 = top, 1 = bottom).' }),
  sunSize: z.number().min(0.1).max(1).default(0.38)
    .meta({ section: 'Light', ui: 'slider', min: 0.1, max: 1, step: 0.02, label: 'Sun size',
            help: 'Radius of the warm halo bleeding through the nebula.' }),
  sunGlow: z.number().min(0).max(1).default(0.62)
    .meta({ section: 'Light', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Glow',
            help: 'Overall brightness of the light bleed and god-rays.' }),
  rayCount: z.number().int().min(0).max(16).default(7)
    .meta({ section: 'Light', ui: 'slider', min: 0, max: 16, step: 1, label: 'God-rays',
            help: 'Number of soft light streaks radiating from the sun. 0 = halo only.' }),
  rayReach: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Light', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Ray reach',
            help: 'How far the god-ray streaks extend across the frame.' }),
  // ── Asteroids ──
  count: z.number().int().min(0).max(60).default(20)
    .meta({ section: 'Asteroids', ui: 'slider', min: 0, max: 60, step: 1, label: 'Asteroids',
            help: 'How many rocks drift through the field. 0 = pure nebula.' }),
  sizeScale: z.number().min(0.4).max(2).default(1)
    .meta({ section: 'Asteroids', ui: 'slider', min: 0.4, max: 2, step: 0.05, label: 'Size',
            help: 'Overall size of the asteroids (a mix of boulders and specks either way).' }),
  jaggedness: z.number().min(0).max(1).default(0.45)
    .meta({ section: 'Asteroids', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Jaggedness',
            help: 'How craggy and irregular the rock outlines are. Low = smooth pebbles.' }),
  mottle: z.number().min(0).max(1).default(0.7)
    .meta({ section: 'Asteroids', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Surface texture',
            help: 'Gritty value-noise mottling and pitting across each rock face, so the lit side '
                + 'reads as pitted stone instead of a smooth ball. 0 = clean gradient.' }),
  tumble: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Asteroids', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Tumble',
            help: 'How fast each rock slowly rotates. 0 = frozen.' }),
  rimLight: z.number().min(0).max(1).default(0.65)
    .meta({ section: 'Asteroids', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Rim light',
            help: 'Warm sun-facing crescent on the dark rocks, so they read against the nebula.' }),
  // ── Camera ──
  panMode: z.enum(PAN_MODES).default('Drift')
    .meta({ section: 'Camera', ui: 'segmented', options: PAN_MODES as unknown as string[], label: 'Motion',
            help: 'Drift = a slow endless wander that never repeats. Pan = a steady glide in one direction.' }),
  panSpeed: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Camera', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Speed',
            help: 'How fast the camera moves through the field. Calm by default. 0 = still.' }),
  panRange: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Camera', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Range',
            help: 'How far the Drift wander travels before easing back.' }),
  panAngle: z.number().min(0).max(360).default(20)
    .meta({ section: 'Camera', ui: 'slider', min: 0, max: 360, step: 5, label: 'Pan heading',
            help: 'Direction of travel in Pan mode (degrees). Ignored in Drift mode.' }),
  // ── Dust ──
  dust: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Dust', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Dust motes',
            help: 'Faint foreground debris drifting nearest the camera.' }),
  stars: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Dust', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Stars',
            help: 'Density of the sharp star field far behind the nebula.' }),
  // ── Color ──
  nebula: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(HOMEWORLD)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Nebula',
            help: 'Color stops of the nebula gradient, dark → light.' }),
  sunColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffcf99')
    .meta({ section: 'Color', ui: 'color', label: 'Sun' }),
  rockColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#14100c')
    .meta({ section: 'Color', ui: 'color', label: 'Rock (shadow)',
            help: 'The dark, shadowed base of each rock.' }),
  rockLit: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8a8073')
    .meta({ section: 'Color', ui: 'color', label: 'Rock (lit)',
            help: 'The sunlit stone tone. Keep it a low-saturation grey-brown so rocks read as '
                + 'stone, not warm clay.' }),
  rimColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffb877')
    .meta({ section: 'Color', ui: 'color', label: 'Rim light' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a1a')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer — sets the nebula, the dust, and the whole asteroid field. A shared '
                + 'link is seedless, so every visit drifts through a different field.' }),
})

export type AsteroidsConfig = z.infer<typeof asteroidsSchema>
