import { z } from 'zod'

const hex = () => z.string().regex(/^#[0-9a-fA-F]{6}$/)

// ⚠️ Every `ui:'segmented'` enum's VALUES are its display strings. Segmented
// renders the option's value and ignores any label (fieldMeta: "a value/label
// split there would be a lie"), so `z.enum(['organic',…])` would put "organic"
// and "both" on the buttons. Those strings therefore travel in the URL and
// appear in every comparison and preset patch.
export const parquetSchema = z.object({
  // ── Deformation ──
  scheme: z.enum(['Organic', 'Grid keys', 'Fractal']).default('Organic')
    .meta({
      section: 'Deformation', ui: 'segmented', label: 'Scheme',
      options: ['Organic', 'Grid keys', 'Fractal'],
      help: 'How a tile edge evolves. Organic grows a curling labyrinth; Grid keys pushes a path '
        + 'around a fine grid into right-angle keys; Fractal replaces each segment with a copy of the '
        + "whole rule. Three schemes from Craig Kaplan's 2010 paper.",
    }),
  organicFamily: z.enum(['Calm', 'Restless', 'Wild']).default('Restless')
    .meta({
      section: 'Deformation', ui: 'select', label: 'Growth',
      options: ['Calm', 'Restless', 'Wild'],
      showWhen: { field: 'scheme', equals: 'Organic' },
      help: 'How restless the growth is. Calm curls smoothly; Wild wanders more before it settles.',
    }),
  fractalRule: z.enum(['Puzzle bump', 'Koch step', 'Zigzag', 'Terrace']).default('Koch step')
    .meta({
      section: 'Deformation', ui: 'select', label: 'Rule',
      options: ['Puzzle bump', 'Koch step', 'Zigzag', 'Terrace'],
      showWhen: { field: 'scheme', equals: 'Fractal' },
      help: 'The shape each segment is replaced by, over and over. Puzzle bump is the most intricate '
        + 'but reaches fewer generations, because a finer curve stops fitting the sampling.',
    }),
  rampMapping: z.enum(['To the knee', 'Whole stack']).default('To the knee')
    .meta({
      section: 'Deformation', ui: 'segmented', label: 'Ramp mapping',
      options: ['To the knee', 'Whole stack'],
      showWhen: { field: 'scheme', equals: 'Organic' },
      help: 'Organic growth stops changing shape about a quarter of the way through its run. '
        + '"To the knee" spends the ramp on the part that still evolves, so the gradient reads. '
        + '"Whole stack" spreads it over everything — a more uniform, more ornate field.',
    }),
  detail: z.number().int().min(4).max(48).default(30)
    .meta({
      section: 'Deformation', ui: 'slider', min: 4, max: 48, step: 1, label: 'Detail',
      help: 'How far along its evolution the edge reaches at the far end of the ramp — low keeps the '
        + 'tiles close to squares, high lets them convolute. Scaled into each scheme\'s own range, so '
        + 'it stays live on all three.',
    }),
  amplitude: z.number().min(0.2).max(2).default(1.7)
    .meta({
      section: 'Deformation', ui: 'slider', min: 0.2, max: 2, step: 0.05, label: 'Amplitude',
      help: 'How far the edge reaches off the lattice line — how much of the tile the deformation '
        + "fills. Past about 1.8 a tile's own edges start to overlap each other. On Grid keys it also "
        + 'stretches the keys, so they read less square.',
    }),
  field: z.enum(['Ramp', 'Radial', 'Diagonal']).default('Ramp')
    .meta({
      section: 'Deformation', ui: 'segmented', label: 'Field',
      options: ['Ramp', 'Radial', 'Diagonal'],
      help: 'Which way the deformation varies across the plane.',
    }),
  rampWidth: z.number().min(3).max(40).default(14)
    .meta({
      section: 'Deformation', ui: 'slider', min: 3, max: 40, step: 0.5, label: 'Ramp width',
      help: 'Tiles per full traverse of the catalogue. Small shows the whole gradient at once; large '
        + 'is "quietly not identical". The pattern repeats every twice this many tiles, so a small '
        + 'value with a small Tile size can close the repeat inside one screen.',
    }),
  // Labelled 'Speed', not 'Drift': this is the piece's ONLY motion, so it is the
  // overall speed control, and 45 of the gallery's other diversions call that
  // 'Speed' against 8 for 'Drift'. Named the minority way it does not read as a
  // speed knob at all — reported by the owner, who went looking for one and did
  // not find it. The field name stays `drift`, so the URL codec is untouched.
  drift: z.number().min(0).max(40).default(10)
    .meta({
      section: 'Deformation', ui: 'slider', min: 0, max: 40, step: 1, label: 'Speed',
      help: 'How fast the whole catalogue flows through the frame — the piece\'s only motion. At the '
        + 'default a full traverse takes about 48 seconds; at 40 it takes about 12. 0 holds it still '
        + 'as a print.',
    }),
  // ── Look ──
  tileSize: z.number().int().min(34).max(170).default(110)
    .meta({
      section: 'Look', ui: 'slider', min: 34, max: 170, step: 2, label: 'Tile size',
      help: 'Lattice spacing in pixels. Small means many more tiles to draw.',
    }),
  renderMode: z.enum(['Fill + line', 'Fill', 'Line']).default('Fill + line')
    .meta({
      section: 'Look', ui: 'segmented', label: 'Render',
      options: ['Fill + line', 'Fill', 'Line'],
      help: 'Line only reads as a drawing; fill only reads as marquetry.',
    }),
  lineWidth: z.number().min(0.5).max(4).default(1.5)
    .meta({
      section: 'Look', ui: 'slider', min: 0.5, max: 4, step: 0.25, label: 'Line weight',
      help: 'Thickness of the tile outline.',
    }),
  // ── Color ──
  tileA: hex().default('#3c556b')
    .meta({
      section: 'Color', ui: 'color', label: 'Tile A',
      help: 'One of the two alternating tile fills — the checkerboard is what makes the shapes read.',
    }),
  tileB: hex().default('#d9d3c5')
    .meta({
      section: 'Color', ui: 'color', label: 'Tile B',
      help: 'The other fill. Keep it well clear of Tile A or the tiling flattens.',
    }),
  line: hex().default('#0d1013')
    .meta({ section: 'Color', ui: 'color', label: 'Edge color', help: 'Stroke around every tile.' }),
  background: hex().default('#171a1d')
    .meta({
      section: 'Color', ui: 'color', label: 'Background',
      help: 'Shows only at the frame edge; the tiling covers the plane.',
    }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({
      section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
      randomizeOnFreshLoad: true,
      help: 'Picks a fresh edge to evolve. A shared link is seedless — every visit opens on a '
        + 'different world. Under Grid keys it picks which sequence of pushes the path takes. The '
        + 'Fractal scheme is fully determined by its rule, so the seed does nothing there.',
    }),
})

export type ParquetConfig = z.infer<typeof parquetSchema>
