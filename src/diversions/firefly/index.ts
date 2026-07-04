import { defineDiversion } from '../../framework/types'
import { fireflySchema, type FireflyConfig } from './schema'
import { createFireflyState, stepFireflies, type FireflyState } from './firefly'

// Parse "#rrggbb" → [r,g,b]. Called once per frame on the stable config colours.
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Which config fields are baked at setup time (can't be applied live).
function structuralKey(c: FireflyConfig): string {
  return `${c.fireflyCount}|${c.seed}|${c.flashRate}|${c.frequencySpread}|${c.motion}`
}

const firefly = defineDiversion<typeof fireflySchema, FireflyState, '2d'>({
  id: 'firefly',
  title: 'Firefly',
  description: 'A meadow of pulse-coupled fireflies. Each charges up and flashes on its own, '
    + 'nudging its neighbours a hair closer to flashing — until chaotic flicker ripples into '
    + 'travelling waves of light and, finally, the whole swarm pulsing in hypnotic unison.',
  kind: '2d',
  schema: fireflySchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createFireflyState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepFireflies(state, dt / 1000)

    const { cfg, n, nx, ny, phase, glow, w, h } = state
    const [fr, fg, fb] = hexRgb(cfg.flashColor)
    const flash = `${fr},${fg},${fb}`
    const size = cfg.glowSize

    // Repaint the night fresh each frame — the afterglow lives in glow[i] decay,
    // not in canvas trails (avoids additive white-out at synchronized density).
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)

    for (let i = 0; i < n; i++) {
      const x = nx[i] * w
      const y = ny[i] * h
      const g = glow[i]

      if (g > 0.04) {
        // Actively flashing: bloom a radial-gradient halo (normal compositing).
        const r = size * (0.5 + 0.9 * g)
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, `rgba(${flash},${(0.9 * g).toFixed(3)})`)
        grad.addColorStop(0.4, `rgba(${flash},${(0.35 * g).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${flash},0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        // Hot near-white core for a sharp, high-contrast spark.
        ctx.fillStyle = `rgba(255,255,235,${(0.85 * g).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, 1.2 + 1.8 * g, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Resting ember: a faint dot that brightens as the firefly charges up,
        // so the dark field flickers with life between flashes.
        const a = 0.05 + 0.14 * phase[i]
        ctx.fillStyle = `rgba(${flash},${a.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, 1.3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },

  resize(state, size, ctx) {
    // Positions are normalized (0..1), so nothing regenerates — just remap.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // Look + coupling params read live from state.cfg each frame/step; baked
    // fields (count, seed, tempo, spread, motion) need a full re-setup.
    if (structuralKey(config) !== structuralKey(state.cfg)) return false
    state.cfg = config
    return true
  },
})

export default firefly
