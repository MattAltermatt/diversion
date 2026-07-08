import { z } from 'zod'

// Faceted-crystal wheel, sampled cyclically by triangle centroid + a slow drift.
const CRYSTAL = ['#0b0f2e', '#1b3a7a', '#2e86ab', '#6fd6d0', '#c9a7eb']

export const delaunayMeshSchema = z.object({
  // ── Mesh ──
  count: z.number().int().min(12).max(150).default(60)
    .meta({ section: 'Mesh', ui: 'slider', min: 12, max: 150, step: 2, label: 'Points',
            help: 'How many drifting points define the mesh. More points make a finer, '
                + 'denser triangulation.' }),
  driftSpeed: z.number().min(0.05).max(2).default(0.4)
    .meta({ section: 'Mesh', ui: 'slider', min: 0.05, max: 2, step: 0.05, label: 'Drift speed',
            help: 'How fast points orbit — the mesh continuously re-triangulates as they move. '
                + 'Lower is a slow, mesmerizing drift.' }),
  mode: z.enum(['filled', 'mesh', 'both']).default('filled')
    .meta({ section: 'Mesh', ui: 'segmented', options: ['filled', 'mesh', 'both'], label: 'Style',
            help: 'Filled paints each triangle as a faceted gem/terrain slab. Mesh draws only the '
                + 'wireframe edges. Both layers dark facet lines over the filled triangles.' }),
  edgeThickness: z.number().min(0.5).max(4).default(1.2)
    .meta({ section: 'Mesh', ui: 'slider', min: 0.5, max: 4, step: 0.1, label: 'Edge thickness',
            help: 'Thickness of the mesh edges (Mesh and Both styles).' }),
  showVertices: z.boolean().default(false)
    .meta({ section: 'Mesh', ui: 'toggle', label: 'Vertex dots',
            help: 'Draw a small dot at each drifting point (the triangulation\'s vertices).' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the initial point positions and orbit phases. A shared link '
                + 'is seedless — every visit drifts a different mesh.' }),
  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(CRYSTAL)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'Triangles are tinted around this wheel by their centroid position, drifting '
                + 'slowly over time.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#04050c')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
})

export type DelaunayMeshConfig = z.infer<typeof delaunayMeshSchema>
