import { parseHex8, type RGBA } from '../../framework/color'
import { sampleGradientRGBA } from '../../framework/gradient'
import { fadeAlpha, localFront, type ForestState, type Tree } from './forest'
import { leafColorIndex } from './tree'

// ─── Rendering ────────────────────────────────────────────────────────────────
// Redraw every frame; the background is composited live (no accumulation buffer)
// so palette/bg edits update instantly. Trees are drawn far → near (painter's
// order). Each tree is fit-scaled by its depth `z`: near = large, low, saturated;
// far = small, high, blended toward the season haze (atmospheric perspective).
// Strokes batch one path per depth (constant width + colour). The reveal front
// clips each straddling branch to a partial line so the tree sprouts. Drawn
// directly on the ctx (no Path2D — jsdom lacks it); foliage is opaque-core +
// low-alpha halo dots (source-over) to avoid additive-glow blowout.

const NEAR_H = 0.5 // near tree height as a fraction of canvas height
const FAR_H = 0.16 // far tree height fraction
const NEAR_Y = 0.9 // near tree base y as a fraction of canvas height
const FAR_Y = 0.52 // far tree base y fraction
const TAU = Math.PI * 2

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: RGBA, b: RGBA, k: number): RGBA => ({
  r: lerp(a.r, b.r, k), g: lerp(a.g, b.g, k), b: lerp(a.b, b.b, k), a: 1,
})
const css = (c: RGBA) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
const rgba = (c: RGBA, alpha: number) =>
  `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`

export function renderForest(state: ForestState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, season } = state

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const alpha = fadeAlpha(state)
  if (alpha <= 0) return

  const haze = parseHex8(season.haze + 'ff')
  const bark8 = season.bark.map((c) => c + 'ff')
  const leaves = season.leaves.map((c) => parseHex8(c + 'ff'))
  const showFoliage = cfg.foliage && leaves.length > 0

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  for (const tree of state.trees) {
    drawTree(state, ctx, tree, bark8, haze, leaves, showFoliage)
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

function drawTree(
  state: ForestState,
  ctx: CanvasRenderingContext2D,
  tree: Tree,
  bark8: string[],
  haze: RGBA,
  leaves: RGBA[],
  showFoliage: boolean,
): void {
  const { cfg, w, h } = state
  const { geo, z } = tree
  const lf = localFront(tree, state.front)
  if (lf <= 0) return

  const baseHeightPx = h * lerp(FAR_H, NEAR_H, z)
  const baseY = h * lerp(FAR_Y, NEAR_Y, z)
  const pxScale = baseHeightPx / geo.height
  const widthScale = lerp(FAR_H, NEAR_H, z) / NEAR_H // far trees thinner
  const k = (1 - z) * cfg.atmosphere // haze blend: far trees recede into fog

  ctx.save()
  ctx.translate(tree.baseXfrac * w, baseY)
  ctx.scale(pxScale, pxScale)
  ctx.translate(-geo.cx, 0)

  // branches — one stroke pass per depth (constant width + bark colour).
  for (let d = 0; d < geo.levels; d++) {
    const segs = geo.byDepth[d]
    if (segs.length === 0) continue
    const u = geo.levels > 1 ? d / (geo.levels - 1) : 0
    const col = mix(sampleGradientRGBA(bark8, u), haze, k)
    ctx.strokeStyle = css(col)
    ctx.lineWidth = Math.max(0.35, cfg.trunkWidth * Math.pow(cfg.taper, d) * widthScale) / pxScale
    ctx.beginPath()
    let drew = false
    for (const s of segs) {
      if (lf <= s.growStart) continue
      const p = Math.min(1, (lf - s.growStart) / Math.max(1e-6, s.growEnd - s.growStart))
      ctx.moveTo(s.x0, s.y0)
      ctx.lineTo(s.x0 + (s.x1 - s.x0) * p, s.y0 + (s.y1 - s.y0) * p)
      drew = true
    }
    if (drew) ctx.stroke()
  }

  // foliage — soft leaf/blossom clusters at the tips, growing in as they finish.
  if (showFoliage) {
    const rBase = (cfg.foliageSize * widthScale) / pxScale
    for (let i = 0; i < geo.tips.length; i++) {
      const t = geo.tips[i]
      const fp = Math.min(1, (lf - t.growStart) / Math.max(1e-6, t.growEnd - t.growStart))
      if (fp <= 0) continue
      const leaf = mix(leaves[leafColorIndex(i, tree.seedn, leaves.length)], haze, k * 0.7)
      const r = rBase * fp
      // low-alpha halo then opaque core (source-over) — no additive blowout.
      ctx.fillStyle = rgba(leaf, 0.22)
      ctx.beginPath()
      ctx.arc(t.x1, t.y1, r * 1.7, 0, TAU)
      ctx.fill()
      ctx.fillStyle = rgba(leaf, 0.92)
      ctx.beginPath()
      ctx.arc(t.x1, t.y1, r, 0, TAU)
      ctx.fill()
    }
  }

  ctx.restore()
}
