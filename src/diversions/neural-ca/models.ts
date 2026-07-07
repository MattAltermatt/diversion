// Neural CA weight loading — see ARCHITECTURE.md for the full scheme.
//
// Weights derive from znah/hexells (Apache-2.0, A. Mordvintsev / E. Niklasson). models.json
// holds 2 dense layers whose per-model coefficients are tiled inside a base64-PNG weight image,
// addressed by a model's position (`index`) in `model_names`. We expose a curated subset of the
// nicely-named DTD textures for the picker.
//
// Runtime loads the 1.16 MB models.json via `?url` + fetch so Vite code-splits it OUT of the main
// bundle (a static `import models from './models.json'` would inline it). Tests import the JSON
// directly (node-side) to guard the curated indices.

// Vite resolves '*?url' to an emitted-asset URL string (typed via vite/client).
import modelsUrl from './models.json?url'

/** One dense layer as stored in models.json. */
export type RawLayer = {
  /** base64 PNG data-URI: "data:image/png;base64,..." — decode via a browser Image. */
  data: string
  /** [in_n (INCLUDES the bias row), out_n]. */
  shape: [number, number]
  /** [cols, rows] — how per-model coefficient blocks tile inside the weight image. */
  layout: [number, number]
  /** dequant scale; w_real = (pixel/255 - 127/255) * scale. */
  scale: number
  /** [quant, zero] companion to `scale` (recorded; the shader uses [scale, 127/255]). */
  quant_scale_zero: [number, number]
}

export type RawModels = { model_names: string[]; layers: RawLayer[] }

/** A dense layer with derived, GL-ready fields (PNG still undecoded — that happens on the GPU). */
export type ParsedLayer = {
  dataUri: string
  /** real input count (bias excluded). */
  inN: number
  outN: number
  /** model-tiling grid inside the weight image. */
  cols: number
  rows: number
  scale: number
  quantScaleZero: [number, number]
}

export function parseLayer(raw: RawLayer): ParsedLayer {
  const [inWithBias, outN] = raw.shape
  const [cols, rows] = raw.layout
  return {
    dataUri: raw.data,
    inN: inWithBias - 1, // shape[0] counts the bias row; real inputs are one fewer (cf. ca.js in_n-1)
    outN,
    cols,
    rows,
    scale: raw.scale,
    quantScaleZero: raw.quant_scale_zero,
  }
}

export type CuratedModel = { id: string; label: string; index: number }

// Curated DTD textures. `index` = position in models.json `model_names` (the weight tiling
// addresses models by this index). Verified against the real name list by models.test.ts —
// if hexells republishes models.json in a different order, that test fails loudly.
export const CURATED: readonly CuratedModel[] = [
  { id: 'bubbly', label: 'Bubbly', index: 133 },
  { id: 'dotted', label: 'Dotted', index: 134 },
  { id: 'interlaced', label: 'Interlaced', index: 135 },
  { id: 'honeycombed', label: 'Honeycombed', index: 136 },
  { id: 'crosshatched', label: 'Crosshatched', index: 138 },
  { id: 'bumpy', label: 'Bumpy', index: 139 },
  { id: 'cobwebbed', label: 'Cobwebbed', index: 140 },
  { id: 'chequered', label: 'Chequered', index: 141 },
  { id: 'swirly', label: 'Swirly', index: 143 },
  { id: 'veined', label: 'Veined', index: 144 },
  { id: 'woven', label: 'Woven', index: 145 },
] as const

export const MODEL_IDS: readonly string[] = CURATED.map((m) => m.id)

export function curatedById(id: string): CuratedModel {
  return CURATED.find((m) => m.id === id) ?? CURATED[0]
}

/** Fetch + parse models.json at runtime (code-split). Returns the two parsed dense layers.
 *  Memoized: models.json is a static 1.16 MB asset, so every neural-ca (re)build shares one
 *  fetch+parse instead of re-downloading it. The parsed layers are treated as immutable by all
 *  consumers (read-only), so the shared result is safe. A rejection is NOT cached — a transient
 *  network failure must not poison later loads (cf. the WebGPU device-cache fix, #265). */
let layersPromise: Promise<ParsedLayer[]> | null = null

export function loadLayers(): Promise<ParsedLayer[]> {
  if (!layersPromise) {
    layersPromise = (async () => {
      const res = await fetch(modelsUrl)
      if (!res.ok) throw new Error(`neural-ca: failed to load models.json (${res.status})`)
      const raw = (await res.json()) as RawModels
      return raw.layers.map(parseLayer)
    })()
    layersPromise.catch(() => { layersPromise = null })
  }
  return layersPromise
}
