import { describe, it, expect } from 'vitest'
import { ablationSchema } from './schema'
import { PICTURES } from './pictures'
import { ablationPresets } from './presets'
import { encodeConfig } from '../../framework/urlCodec'

describe('ablation schema', () => {
  it('parses to a complete default config', () => {
    const cfg = ablationSchema.parse({})
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
    expect(cfg.cellSize).toBeGreaterThan(0)
    expect(cfg.capacity).toBeGreaterThan(0)
    expect(cfg.charge).toBeGreaterThan(0)
  })

  it('puts seed in a collapsed Advanced section and randomises it on fresh load', () => {
    const meta = ablationSchema.shape.seed.meta() as Record<string, unknown>
    expect(meta.section).toBe('Advanced')
    expect(meta.collapsed).toBe(true)
    expect(meta.randomizeOnFreshLoad).toBe(true)
    expect(meta.ui).toBe('number')
  })

  it('labels the colour list Palette and the ground Background', () => {
    const pal = ablationSchema.shape.palette.meta() as Record<string, unknown>
    expect(pal.ui).toBe('colorList')
    expect(pal.label).toBe('Palette')
    expect(pal.section).toBe('Color')
    const bg = ablationSchema.shape.background.meta() as Record<string, unknown>
    expect(bg.ui).toBe('color')
    expect(bg.label).toBe('Background')
  })

  it('gives every field a section and every slider explicit bounds', () => {
    for (const [name, field] of Object.entries(ablationSchema.shape)) {
      const meta = (field as { meta(): Record<string, unknown> }).meta()
      expect(meta.section, `${name} needs a section`).toBeTruthy()
      if (meta.ui === 'slider') {
        expect(typeof meta.min, `${name} slider needs min`).toBe('number')
        expect(typeof meta.max, `${name} slider needs max`).toBe('number')
      }
    }
  })

  it('supports a two-colour palette (black and white)', () => {
    const cfg = ablationSchema.parse({ palette: ['#000000', '#ffffff'] })
    expect(cfg.palette).toEqual(['#000000', '#ffffff'])
  })

  it('defaults to an evenly spread crew hunting proportionally', () => {
    const d = ablationSchema.parse({})
    expect(d.spacing).toBe(1)
    expect(d.targetingBias).toBe(1)
    expect(d.targeting).toBe('Mixed')
    // A reserve by default, so the queue is something to read rather than an empty row.
    expect(d.queued).toBeGreaterThan(0)
  })

  it('has no arrivalRate field', () => {
    expect(Object.keys(ablationSchema.shape)).not.toContain('arrivalRate')
  })

  it('rejects an unknown targeting mode', () => {
    expect(ablationSchema.safeParse({ targeting: 'Frenzy' }).success).toBe(false)
  })
})

describe('ablation presets', () => {
  it('declares a Palette axis and a Demolition axis', () => {
    expect(ablationPresets.map((g) => g.label).sort()).toEqual(['Demolition', 'Palette'])
  })

  it('every preset patch parses as a valid config', () => {
    for (const group of ablationPresets) {
      for (const option of group.options) {
        expect(() => ablationSchema.parse({ ...ablationSchema.parse({}), ...option.patch })).not.toThrow()
      }
    }
  })

  it('options within a group all set the same keys (matchPresets assumption)', () => {
    for (const group of ablationPresets) {
      const keys = group.options.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(keys).size).toBe(1)
    }
  })

  it('gives every Demolition option the identical key-set', () => {
    const demolition = ablationPresets.find((g) => g.label === 'Demolition')!
    const keys = demolition.options.map((o) => Object.keys(o.patch).sort().join(','))
    expect(new Set(keys).size).toBe(1)
  })

  it('offers a Unison option in the Demolition group', () => {
    const demolition = ablationPresets.find((g) => g.label === 'Demolition')!
    expect(demolition.options.some((o) => o.patch.targeting === 'Unison')).toBe(true)
  })
})

describe('image source (#278)', () => {
  const d = ablationSchema.parse({})

  it('defaults to Contours so every existing link is unchanged', () => {
    expect(d.source).toBe('Contours')
    expect(d.image).toBeUndefined()
  })

  it('the image id never reaches a link, even a pinned one', () => {
    const sp = encodeConfig(ablationSchema, { ...d, source: 'Yours', image: 'img_x' } as never,
      { includePinned: true })
    expect(sp.has('image')).toBe(false)
    expect(sp.get('source')).toBe('Yours')
  })

  type FieldName = keyof typeof ablationSchema.shape
  const showWhenOf = (k: FieldName) => ablationSchema.shape[k].meta()?.showWhen

  it('contour-only fields are gated on source', () => {
    for (const k of ['featureSize', 'roughness', 'palette'] as FieldName[]) {
      expect(showWhenOf(k)).toEqual({ field: 'source', equals: 'Contours' })
    }
  })

  it('the upload picker is gated on Yours alone', () => {
    expect(showWhenOf('image')).toEqual({ field: 'source', equals: 'Yours' })
  })

  it('colors serves BOTH picture sources, so it is gated on the pair', () => {
    expect(showWhenOf('colors')).toEqual({ field: 'source', equals: ['Pictures', 'Yours'] })
  })

  it('the bundled picker is gated on Pictures alone', () => {
    expect(showWhenOf('picture')).toEqual({ field: 'source', equals: 'Pictures' })
  })

  it('the bundled choice DOES travel in a link — that is the point of it', () => {
    const sp = encodeConfig(ablationSchema, { ...d, source: 'Pictures', picture: PICTURES[0].slug } as never)
    expect(sp.get('picture')).toBe(PICTURES[0].slug)
    expect(ablationSchema.shape.picture.meta()?.local).toBeUndefined()
    expect(ablationSchema.shape.picture.meta()?.randomizeOnFreshLoad).toBeUndefined()
  })

  it('cellSize and background are gated on neither — they serve both modes', () => {
    expect(ablationSchema.shape.cellSize.meta()?.showWhen).toBeUndefined()
    expect(ablationSchema.shape.background.meta()?.showWhen).toBeUndefined()
  })

  it('colors covers the same band range the palette does', () => {
    expect(() => ablationSchema.parse({ colors: 1 })).toThrow()
    expect(() => ablationSchema.parse({ colors: 25 })).toThrow()
    expect(ablationSchema.parse({ colors: 24 }).colors).toBe(24)
  })
})

describe('presets vs image source (#278)', () => {
  const group = (label: string) => ablationPresets.find((g) => g.label === label)!

  it('every Palette option returns the piece to Contours', () => {
    for (const opt of group('Palette').options) {
      expect(opt.patch.source).toBe('Contours')
    }
  })

  it('the Demolition axis leaves source alone — it is orthogonal', () => {
    for (const opt of group('Demolition').options) {
      expect(opt.patch.source).toBeUndefined()
    }
  })

  it('every Palette option still patches the same key-set (matchPresets rule)', () => {
    const keys = group('Palette').options.map((o) => Object.keys(o.patch).sort().join(','))
    expect(new Set(keys).size).toBe(1)
  })
})
