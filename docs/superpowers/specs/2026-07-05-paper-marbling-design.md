# Paper Marbling (#249) — build spec

Digital Ebru / Suminagashi via **exact closed-form marbling maths** (Aubrey Jaffer,
*Mathematical Marbling*). NOT a fluid sim — a deterministic composition of drop &
comb deformations, so it's a perfect seed/codec fit.

## Render architecture (decided by dueling architects, 2026-07-05)

**Backward inverse-map fragment shader** (`kind: 'webgl'`, plasma-shaped). The sheet is
the composition `F = f_n ∘ … ∘ f_1` of drop/comb maps. To colour output pixel `Q`, the
fragment shader walks the operator stack **backward** (last-applied first), inverting each
map, until the pre-image lands inside a fresh drop's disk (→ that ink) or falls through the
whole stack (→ procedural paper). Chosen over forward-polygon because: animation is free
(both operators are parametric in a single completion scalar), it's resolution-perfect
(no vertex growth / decimation / downres), the tine inverse is singularity-free, and it's
the proven `plasma` idiom (60fps at full res).

### The two operators (closed form)

```
DROP  forward:  P' = C + (P−C)·√(1 + r²/|P−C|²)
      inverse:  given Q, let D² = |Q−C|²
                if D² < r²  → TERMINAL: pixel is this drop's ink (fresh paint covers all)
                else        → P = C + (Q−C)·√(1 − r²/D²)

COMB  (a rank of parallel tines, all pulling along unit dir M, teeth spaced s apart,
       tooth lines PARALLEL to M so perpendicular distance is invariant → exact inverse)
      forward:  P' = P + z·u^{dNear(P)}·M      dNear = dist from P to nearest tooth line
      inverse:  given Q,  P = Q − z·u^{dNear(Q)}·M          (dNear(Q) == dNear(P))
      z = pull amount, u = sharpness ∈ (0,1), N = ⟂ M, perp = (P−A)·N,
      dNear = |mod(perp − phase + s/2, s) − s/2|
```

Reverse-walk colour resolution: DROP disk hit → `u_ink[colorId]`; fall-through → procedural
paper (`background` + fine value-noise). Painter order == creation order, permanently (every
op is a plane bijection applied to all points identically), so no z-sort is ever needed.

### v1 simplifications (follow-ups filed if they bind)

- Operators packed into an **RGBA32F data texture** (NEAREST, `texelFetch`), width `MAX_OPS`,
  2 rows (opA / opB) — dodges the fragment-uniform-vector cap, scales past 128 ops.
- **No FBO / bake** — procedural paper on fall-through, recipes stay ≤ `MAX_OPS`.
- **Straight combs only** (clean inverse). Wavy "Spanish wave" combs deferred (need an
  iterative inverse).

## Sheet cycle (loop = "A", user-chosen)

Recipe generated once from `seed` → a time-ordered `Operation[]`. `frame()` advances
`sheetMs`; `opCount` = ops whose `startMs ≤ sheetMs`; the newest in-progress op animates its
completion scalar (drop `r(t)`, comb `z(t)`); earlier ops are frozen at full. When the recipe
finishes → **hold** a beat → **fade** (shader lerps composite → paper) → `shouldRestart`
reseeds a fresh sheet (dla's hold→reseed idiom).

## Design surface (knobs + presets — the tweak surface)

Section **The Marbling**: `pattern` (segmented: Stone/Nonpareil/Feather/Bouquet/Get-gel —
generator mode), `dropCount`, `dropSize`, `combSpacing`, `combStrength` (z), `sharpness` (u),
`speed`.
Section **Color**: `colors` (colorList ink palette, ≤8), `background` (paper), `paperGrain`.
Section **Advanced**: `seed` (pin-only, `randomizeOnFreshLoad`).

Presets — two axes (mirrors dla): **Pattern** (recipe + numeric tuning) and **Palette**
(Suminagashi indigo/black on cream · Ebru multi-hue · Modern bold · Monochrome).

## Files

```
schema.ts    Zod schema (single source: form + codec + Config type)
ops.ts       pure maths: Operation union, forward+inverse (unit-tested round-trip)
schedule.ts  generateSchedule(seed, cfg) → timed Operation[] per pattern (seeded)
gl.ts        shader src (backward walk), initGL/render/disposeGL, op data-texture packer
presets.ts   Pattern + Palette PresetGroups
index.ts     defineDiversion<…,'webgl'>: setup/frame/update/shouldRestart/teardown
*.test.ts    ops round-trip + schedule determinism
```

Reference: Aubrey Jaffer, "Mathematical Marbling"
(people.csail.mit.edu/jaffer/Marbling/) — clean-room reimplementation, credited.
