# Flow Field — trails, lifespan & white-out tame

**Issues:** #22 (trail-persistence + lifespan controls) · #27 (tame additive white-out) · **Date:** 2026-06-26 · **Status:** design approved

Promote Flow Field's two hardcoded look levers — trail-fade strength and particle lifespan — to user controls, and flip the default blend to `screen` so the piece no longer clips to white out of the box. The white-out (#27) and trail persistence (#22) are the same dial seen from two sides: white-out is a steady state where additive stroke input on a hot streamline outpaces the per-frame trail decay, so the controls that govern accumulation (trail-fade, lifespan, plus existing particle count and per-color alpha from #23) *are* the white-out levers.

Scoped to **option A** of #27: controls + good defaults, **no per-pixel luminance cap** (a true HDR cap needs per-frame pixel readback or WebGL — deferred to a possible WebGL era, ties to #13).

## Goals

- Expose **trail length** (the fade-alpha) as a slider, with a safe floor.
- Expose **particle lifespan** as a slider, preserving the anti-pulse spread and collapse floor.
- **Default blend `screen`** so the out-of-box look does not white-out.
- Default values reproduce today's look (no surprise change for existing feel).

## Non-goals

- A per-pixel luminance cap / HDR tone-map (#27 option B — deferred).
- Removing the `fadeTrails` toggle (user chose to keep it; see Decisions).
- Min/max or spread sliders for lifespan (YAGNI — one slider, fixed internal spread).
- Any change to the palette/color system (#23, shipped).

## Decisions (from brainstorm)

- **#27 ambition:** controls + defaults, no per-pixel mechanism (A).
- **Trail control:** keep the `fadeTrails` toggle **and** add a `trailLength` slider (B). The slider stays **always visible and live** (shows its value); it is simply inert while trails are off. Honors "hide nothing" (nothing is hidden/collapsed); help text states it only affects the look when Motion Trails is on.
- **Lifespan:** one `lifespan` slider with a fixed internal min↔max ratio (A).
- **Default blend:** flip `'lighter'` → `'screen'` (A).

## Schema (`src/diversions/flow-field/schema.ts`)

- **`blend`** — unchanged enum `['lighter','screen','normal']`, default changes `'lighter'` → **`'screen'`**.
- **`fadeTrails`** — unchanged boolean toggle, default `true`.
- **`trailLength`** — new: `z.number().min(0).max(100).default(88)` with
  `.meta({ ui:'slider', min:0, max:100, step:1, label:'Trail length', help:'Length of the fading motion trails. 0 wipes each frame; higher leaves longer, slower-fading ribbons. Only affects the look when Motion Trails is on.' })`.
- **`lifespan`** — new: `z.number().min(0.5).max(12).default(4)` with
  `.meta({ ui:'slider', min:0.5, max:12, step:0.1, label:'Particle lifespan', help:'Seconds a particle lives before respawning elsewhere. Shorter = busier, fewer long streaks; longer = sparser, longer ribbons.' })`.

Field order in the schema (definite): `lifespan` immediately after `speed` (both are motion/lifecycle params), and `trailLength` immediately after `fadeTrails` (they read together). Both are top-level fields (siblings of `blend`/`fadeTrails`), not inside the `palette` group.

## Mechanism (`src/diversions/flow-field/flowField.ts`)

### Trail fade

A pure helper maps the slider to a per-frame fade alpha, with a `0.02` floor so
alpha never reaches `0` (which would be infinite accumulation → guaranteed
white-out):

```ts
const TRAIL_FADE_FLOOR = 0.02
/** trailLength 0..100 -> per-frame fade alpha 1.0..0.02 (higher length = longer trail). */
export function trailFadeAlpha(trailLength: number): number {
  const a = 1 - (trailLength / 100) * (1 - TRAIL_FADE_FLOOR)
  return Math.min(1, Math.max(TRAIL_FADE_FLOOR, a))
}
/** 0..1 -> two-digit hex byte for hex-append (e.g. 0.137 -> "23"). */
export function toHex2(alpha: number): string {
  return Math.round(alpha * 255).toString(16).padStart(2, '0')
}
```

In `stepFlow`, the fade fill replaces the hardcoded `+ '22'`:

```ts
const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
ctx.fillStyle = `${cfg.palette.background}${toHex2(fadeAlpha)}`
ctx.fillRect(0, 0, w, h)
```

When `fadeTrails` is off, `fadeAlpha = 1` → `background + 'ff'` = fully opaque =
hard clear each frame (identical to today's off behavior). Default
`trailLength: 88` → `trailFadeAlpha(88) = 1 - 0.88·0.98 = 0.1376` → `toHex2 = '23'`
≈ today's hardcoded `'22'`, so the default look is preserved.

### Lifespan

The hardcoded `MIN_LIFE`/`MAX_LIFE` constants are replaced by values derived from
`cfg.lifespan` (seconds → ms), keeping the current ⅓ min/max ratio so the
respawn stagger (anti-pulse) and the populated-field floor remain invariants the
user can't break:

```ts
const LIFE_MIN_RATIO = 1 / 3 // today's 1333/4000; preserves anti-pulse stagger
function lifeBounds(lifespanSeconds: number): { min: number; max: number } {
  const max = lifespanSeconds * 1000
  return { min: max * LIFE_MIN_RATIO, max }
}
function randomLife(rng: () => number, lifespanSeconds: number): number {
  const { min, max } = lifeBounds(lifespanSeconds)
  return min + rng() * (max - min)
}
```

`createFlowState` and the respawn branch in `stepFlow` call
`randomLife(rng, cfg.lifespan)`; the initial-age stagger uses `lifeBounds(cfg.lifespan).max`
instead of the old `MAX_LIFE` constant. At default `lifespan: 4` this yields
`min = 1333`, `max = 4000` — exactly today's constants.

The standalone `MIN_LIFE` / `MAX_LIFE` module constants are removed.

## UX invariants check

1. **Readability** — two clearly-labeled sliders. ✅
2. **Hide nothing** — `trailLength` always visible/live (inert-while-off is stated in help, not hidden). ✅
3. **Inline help** — both sliders carry persistent help; trail help notes the toggle dependency. ✅
4. **Sliders only when bounded** — both have explicit min/max. ✅
5. **More contrast** — unchanged theme. ✅

## Testing (`flowField.test.ts`, co-located)

- **`trailFadeAlpha`** — `0 → 1`; `100 → 0.02` (floor, not below); `88 → ≈0.1376`; monotonically decreasing.
- **`toHex2`** — `1 → 'ff'`, `0 → '00'`, `0.1376 → '23'`.
- **lifespan mapping** — `createFlowState({...,lifespan:4})` gives every particle `life ∈ [1333, 4000]`; `lifespan:12` → `[4000, 12000]`; `lifespan:0.6` → `[200, 600]` (floor respected, ⅓ ratio holds).
- **determinism** — same seed → identical particle layout (unchanged guarantee, now with the lifespan-derived bounds).
- **default blend** — `flowFieldSchema.parse({}).blend === 'screen'`.
- **codec** — `trailLength`/`lifespan` are plain numbers; the existing codec round-trip/resilience tests already cover number leaves (no new codec code).

## Build sequence

1. Schema: flip `blend` default; add `trailLength` + `lifespan` fields.
2. `flowField.ts`: add `trailFadeAlpha` + `toHex2`; wire fade fill; replace `MIN_LIFE`/`MAX_LIFE` with `lifeBounds`/`randomLife(cfg.lifespan)` (+ tests).
3. Chrome verify: default `screen` shows no white-out; drag Trail length (0 wipes, high = long ribbons) and Lifespan; flip blend to `lighter` and confirm trails/lifespan still tame accumulation; share-link round-trip.

## Open / deferred

- True per-pixel luminance cap / HDR tone-map (#27 option B) — deferred to a possible WebGL flow field (#13).
- A `diversion.update?` hook to avoid full `setup` re-run on each edit — still backlogged (CLAUDE.md gotcha); works fine under re-run-setup.
