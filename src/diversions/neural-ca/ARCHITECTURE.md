# Neural CA — discovered architecture (Task 1 spike output)

Source of truth: **`znah/hexells`** (Apache-2.0) — `hexells-ca.reference.js` (vendored copy
of `ca.js`) + `models.json` (vendored weights). This file records what the spike found so the
GPU port (Tasks 3–4) matches hexells exactly. **The plan's original MRT / RGBA32F / 16-channel
assumptions were wrong** — corrected below.

## models.json layout

`{ model_names: string[], layers: Layer[] }`

- **`model_names`** — ~170 entries. Curated/usable DTD textures (good picker names):
  `bubbly_0101`, `dotted_0201`, `interlaced_0081`, `honeycombed_0171`, `honeycombed_0061`,
  `crosshatched_0121`, `bumpy_0081`, `cobwebbed_0141`, `chequered_0121`, `chequered_0051`,
  `swirly_0071`, `veined_0141`, `woven_0121`. The rest are `mixed4*` Inception-channel experiments
  + `*-mondrian` variants — we expose only a curated subset.
- **`layers`** — exactly **2** dense layers (shared across ALL models; per-model weights are
  *tiled within each layer's image*, addressed by `modelIdx`). Each layer:
  - `data` — a **base64 PNG data-URI** (`"data:image/png;base64,..."`). Decode = browser-native
    `Image`/`createImageBitmap` → upload as a `NEAREST` uint8 RGBA texture. **No UPNG/base64-float
    parsing needed** (hexells uses UPNG only as an iOS premultiply workaround).
  - `shape` — `[in_n, out_n]`. Layer0 `[49, 96]`, Layer1 `[97, 12]`. (`in_n` includes the bias row.)
  - `layout` — model-grid tiling inside the image. Layer0 `[20, 9]`, Layer1 `[87, 2]`
    (cols, rows of models). `modelIdx → (col=mod(idx,cols), row=floor(idx/cols))` offsets the read.
  - `scale` — dequant scale. `quant_scale_zero` — `[quant, zero]` (recorded; the shader's
    `u_weightCoefs = [scale, 127/255]`, i.e. `w_real = (pixel - 127/255) * scale`).

## The network (per cell, per step)

```
C = 12 state channels (first 4 = visible RGBA, rest hidden)
Perception P = 48 = 12 channels × 4 filter bands:
  band 0: identity (channel value)
  band 1: sobelX rotated by the cell's direction:  dx*c - dy*s
  band 2: sobelY rotated:                          dx*s + dy*c
  band 3: gauss/Laplacian
  → HEX kernels (sobelXhex/sobelYhex/gaussHex) when u_hexGrid = 1.0 (we use hex)
dense0: 48(+bias) → 96, then ReLU      (weights = layer0 PNG, indexed by modelIdx)
dense1: 96(+bias) → 12, linear          (weights = layer1 PNG, indexed by modelIdx)
update: state += delta  WHERE  hash13(xy, seed) <= 0.5   (stochastic fire-rate mask)
```

- **Per-cell direction** (`getCellDirection`) steers the sobels via an "alignment" field. For a
  plain churning texture we set alignment constant (`c=1, s=0` → no rotation), which simplifies
  the perception pass. (Steerable alignment = backlog.)
- **`modelIdx` is per-cell** in hexells (lets regions blend models). For our v1 single-texture
  behavior, `modelIdx` is **uniform** across all cells (a constant), so the per-cell `u_control`
  texture collapses to one value.

## Buffers — NOT MRT, NOT float

Hexells packs a `C×H×W` tensor into **one uint8 texture** via `createTensor`: `depth4=ceil(C/4)`
channel-groups are tiled in a `gridW×gridH` grid inside a `(W*gridW)×(H*gridH)` texture, addressed
by `u_input_read(xy, ch)`. So:

- **state** tensor: depth 12 → depth4 3 → tiled 2×2 (one uint8 RGBA texture), ping-ponged.
- **perception** tensor: depth 48 → depth4 12 → tiled 4×3 (one texture).
- **hidden** tensor: depth 96 → depth4 24.
- All **NEAREST**, uint8 with per-tensor `packScaleZero` (un/pack in-shader). **No RGBA32F, no
  `drawBuffers`/MRT, no `OES_texture_float_linear`.** (WebGL1-era design; works as-is in our WebGL2.)
- Default **grid = 96×96** (tiny + cheap); the display shader hex-upscales to the canvas.

## Shader programs (4)

`perception` → `dense0(+relu)` → `dense1` → `update` (ping-pong state), then `display`
(hex render of state RGB to screen). All four reimplemented in our framework's GLSL following
`hexells-ca.reference.js` (programs `perception`, `dense`, `update`, and the vis fragment).

## Port consequences (vs the original plan)

| plan assumed | actual (hexells) |
|--------------|------------------|
| 16 channels, 4× RGBA32F MRT | **12 channels, single uint8 channel-tiled textures** |
| float render targets | **uint8 + per-tensor pack/unpack** |
| "parse JSON → Float32 weight arrays" | **base64-PNG → Image → texture** (browser-native) |
| ~M effort | **L–XL**: porting hexells' tensor-tiling + 4 programs + hex conv |

Fidelity gate (Task 4) = the chosen model reproduces its hexells counterpart at
`https://znah.net/hexells/`. The packed-weights + tile-addressing must match exactly or it won't.

## Asset bundling

`models.json` is **1.16 MB** (base64 PNGs inside). Load via **dynamic `import()`** (Vite
code-splits it out of the main bundle) or `?url` + fetch — do NOT static-import into the entry
chunk. Decided in Task 3.

## Credit / license

Weights (`models.json`) + reference math (`hexells-ca.reference.js`) © Alexander Mordvintsev /
Eyvind Niklasson, Apache-2.0 (`HEXELLS-LICENSE.txt`). Clean-room GLSL reimplementation; assets
vendored verbatim with attribution. Compatible with this repo's MIT license.
```
