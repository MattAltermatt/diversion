import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Luminous cyan → violet → magenta → gold — high-contrast against the dark sky
// (UX invariant #5). Matches the 'Nebula' entry in presets.ts by design (the
// default config IS a named preset, like aurora's 'Classic Green').
const DEFAULT_PALETTE = ['#00e6ff', '#7b2ff7', '#ff2e93', '#ffcc33']

export const raymarcherSchema = z.object({
  // ── Shape ──
  primitives: z.number().int().min(2).max(5).default(4)
    .meta({ section: 'Shape', ui: 'slider', min: 2, max: 5, step: 1, label: 'Primitives',
            help: 'How many SDF shapes (spheres, rounded boxes, tori) fuse into the sculpture.' }),
  blend: z.number().min(0.15).max(1.6).default(0.65)
    .meta({ section: 'Shape', ui: 'slider', min: 0.15, max: 1.6, step: 0.05, label: 'Blend Smoothness',
            help: 'How strongly the shapes melt into each other. Low = distinct forms touching; '
                + 'high = one continuous molten blob.' }),
  morphSpeed: z.number().min(0).max(1.5).default(0.22)
    .meta({ section: 'Shape', ui: 'slider', min: 0, max: 1.5, step: 0.05, label: 'Morph Speed',
            help: 'How fast the shapes orbit and reshape the sculpture. 0 = a frozen, static form.' }),
  cameraSpeed: z.number().min(0).max(1.5).default(0.12)
    .meta({ section: 'Shape', ui: 'slider', min: 0, max: 1.5, step: 0.05, label: 'Camera Speed',
            help: 'How fast the camera drifts around the sculpture. 0 = a fixed viewpoint.' }),
  // ── Light ──
  lightHue: z.number().min(0).max(360).default(38)
    .meta({ section: 'Light', ui: 'slider', min: 0, max: 360, step: 1, label: 'Light Hue',
            help: 'Color of the key light — warm amber through cool blue-white — tints the '
                + 'highlights and rim glow across the whole sculpture.' }),
  // ── Color ──
  palette: z.array(hex6).min(2).max(6).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 6, label: 'Palette',
            help: 'The color ramp painted across the sculpture surface as it morphs.' }),
  skyHorizon: hex6.default('#05060f')
    .meta({ section: 'Color', ui: 'color', label: 'Sky Horizon',
            help: 'The dark gradient color low on the backdrop, behind the sculpture.' }),
  skyZenith: hex6.default('#161c3c')
    .meta({ section: 'Color', ui: 'color', label: 'Sky Zenith',
            help: 'The dark gradient color at the top of the backdrop.' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
            randomizeOnFreshLoad: true,
            help: 'Perturbs each shape’s placement, size and phase. A fresh visit rolls a '
                + 'new sculpture; a shared link is seedless. Pin an explicit seed to reproduce one.' }),
})

export type RaymarcherConfig = z.infer<typeof raymarcherSchema>
