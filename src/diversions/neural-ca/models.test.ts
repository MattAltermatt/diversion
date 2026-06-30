import { describe, it, expect } from 'vitest'
import rawJson from './models.json'
import { CURATED, MODEL_IDS, parseLayer, type RawLayer, type RawModels } from './models'

const models = rawJson as unknown as RawModels

describe('neural-ca models', () => {
  it('exposes curated model ids (unique, non-empty)', () => {
    expect(MODEL_IDS.length).toBeGreaterThan(0)
    expect(new Set(MODEL_IDS).size).toBe(MODEL_IDS.length)
  })

  it('every curated index resolves to its named texture in model_names (order guard)', () => {
    // If hexells republishes models.json reordered, these indices would point at the wrong
    // weights and the textures would silently be wrong — fail loudly here instead.
    for (const m of CURATED) {
      expect(m.index, `${m.id} index in range`).toBeGreaterThanOrEqual(0)
      expect(m.index).toBeLessThan(models.model_names.length)
      expect(models.model_names[m.index]).toMatch(new RegExp(`^${m.id}`))
    }
  })

  it('parses the two dense layers with a consistent dimension chain', () => {
    expect(models.layers.length).toBe(2)
    const [l0, l1] = models.layers.map(parseLayer)
    // perception(48) -> hidden(96) -> channels(12)
    expect(l0.inN).toBe(48)
    expect(l0.outN).toBe(96)
    expect(l1.inN).toBe(96) // dense1 input == dense0 output (post-ReLU hidden)
    expect(l1.outN).toBe(12) // == state channel count
    expect(l0.outN).toBe(l1.inN)
  })

  it('parseLayer drops the bias row from shape[0] and keeps tiling/quant metadata', () => {
    const fixture: RawLayer = {
      data: 'data:image/png;base64,AAAA',
      shape: [49, 96],
      layout: [20, 9],
      scale: 2.2,
      quant_scale_zero: [2, 0],
    }
    const p = parseLayer(fixture)
    expect(p).toEqual({
      dataUri: 'data:image/png;base64,AAAA',
      inN: 48,
      outN: 96,
      cols: 20,
      rows: 9,
      scale: 2.2,
      quantScaleZero: [2, 0],
    })
  })
})
