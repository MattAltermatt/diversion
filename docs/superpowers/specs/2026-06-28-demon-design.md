# 🐛 Demon — design spec

**Issue:** #77 (`xscreensaver/demon`, `port:easy`, Canvas2D).
**Source:** xscreensaver hack `demon` — David Griffeath's **cyclic cellular
automaton**. Clean-room reimplementation with full credit in the source header
and the diversion `description` (per the project's xscreensaver-port ethos:
faithful mechanic, gallery-grade looks).

Date: 2026-06-28.

---

## 1. Mechanic — cyclic cellular automaton

A grid of cells, each holding a color index in `0 … N−1`. Predation is a
**ring with adjustable dominance reach `k`**: color `i` is prey to its `k`
ring-successors `i+1, i+2, …, i+k` (mod N). Equivalently, a cell of color `c`
can be eaten by any of the colors `c+1 … c+k`.

**Update rule (per cell, per tick):**

1. Let `c` be the cell's current color.
2. For offset `j = 1, 2, …, k_eff` (in ascending order), let predator
   `p = (c + j) mod N`. Count how many of the cell's neighbors hold color `p`.
3. The **first** predator `p` whose neighbor-count is `≥ T_eff` wins: the cell
   flips to `p`. If no predator qualifies, the cell keeps color `c`.

Ascending-offset order means the **nearest successor** (`c+1`, the classic
demon predator) takes priority; farther predators (`c+2 …`) only break through
where the immediate successor is absent. This makes `k = 1` **exactly** the
classic cyclic CA (cell advances `c → c+1` iff `≥ T` neighbors hold `c+1`).

All cells update **synchronously** from a snapshot of the previous grid
(double-buffered) — a cyclic CA is order-sensitive, so we must not read
half-updated state.

From uniform random initial noise, the system self-organizes into rotating
**spiral waves** ("demons"). `k` controls dominance breadth (`k = 2` is
rock-paper-scissors-lizard-spock); `T` controls spiral coarseness.

### Clamping (runtime, every step)

- `k_eff = clamp(k, 1, floor((N − 1) / 2))`. Above `floor((N−1)/2)` the ring
  predation becomes degenerate (a color preys on >half the ring → collapse),
  so we clamp. The slider's static max is 7 (covers N = 16).
- `T_eff = clamp(T, 1, neighborCount(field))`. Triangle caps `T` at 3,
  square at 4, hex at 6. The slider's static max is 6.

---

## 2. Tessellation abstraction (key new architecture)

The CA core is **field-agnostic**. One small module per field provides cell
geometry and adjacency; the core only ever walks neighbor-index lists.

```ts
interface Tessellation {
  readonly cellCount: number
  // Flat neighbor-index lists, one contiguous slice per cell.
  neighborsOf(i: number): readonly number[]
  // Draw cell i filled with the given CSS color (seamless, no gap).
  drawCell(ctx: CanvasRenderingContext2D, i: number, fill: string): void
}
```

Built once per `setup` / structural change from `(field, cellSize, width,
height)`. Neighbor lists are precomputed (an array of `Int32Array` or a flat
CSR-style buffer) so the per-tick loop never recomputes adjacency.

| field    | neighbors        | geometry                                  |
| -------- | ---------------- | ----------------------------------------- |
| square   | 4 (N / E / S / W)| axis-aligned grid; `fillRect`             |
| hexagon  | 6                | pointy-top hex, odd-row offset; hex path  |
| triangle | 3 (edge-adjacent)| alternating ▲▼ rows; per-cell tri path    |

**Edges:** non-wrapping (border cells simply have fewer neighbors). Wrapping is
not required for spirals to form and complicates triangle/hex indexing; omit.

**Neighbor reciprocity** is a test invariant: if `b ∈ neighborsOf(a)` then
`a ∈ neighborsOf(b)`, for every field.

---

## 3. Schema (single source of truth)

Drives the config form, the URL codec, and the `Config` type. Zod 4,
`.default().meta({...})`.

| field            | ui          | bounds / options                      | default       |
| ---------------- | ----------- | ------------------------------------- | ------------- |
| `field`          | `segmented` | `square` \| `hexagon` \| `triangle`   | `hexagon`     |
| `colors` (N)     | `slider`    | 3 – 16 (int)                          | 8             |
| `dominanceReach` | `slider`    | 1 – 7 (int, clamped ⌊(N−1)/2⌋)        | 1             |
| `threshold` (T)  | `slider`    | 1 – 6 (int, clamped to field nbrs)    | 2             |
| `speed`          | `slider`    | steps/sec, calm range (e.g. 2 – 30)   | ~8 (zen-calm) |
| `cellSize`       | `slider`    | px, grid resolution (e.g. 4 – 24)     | ~10           |
| `color` (group)  | `group`     | hueStart, hueSpan, saturation, lightness | see below  |
| `background`     | `color`     | hex                                   | near-black    |

`color` group fields:

| field        | ui       | bounds        | default |
| ------------ | -------- | ------------- | ------- |
| `hueStart`   | `slider` | 0 – 360       | 0       |
| `hueSpan`    | `slider` | 0 – 360       | 360     |
| `saturation` | `slider` | 0 – 100       | ~70     |
| `lightness`  | `slider` | 0 – 100       | ~55     |

Inline help (`.meta({ help })`, persistent) on the non-obvious knobs:
`dominanceReach` ("how many colors each one eats — 1 = classic spiral demon,
2 = rock-paper-scissors-lizard-spock"), `threshold` ("how many predator
neighbors are needed to flip a cell — higher = broader, calmer spirals"),
`field` (mention each field's neighbor count → different spiral character).

`field`, `colors`, and `cellSize` carry the `field`/`select`/`number`-style
metadata the form needs; bounds satisfy UX invariant #4 (sliders only with
defined min/max).

---

## 4. Coloring — hue-ring

The N colors are N **evenly-spaced hues** sampled from the `color` arc:

```
hue_i = (hueStart + hueSpan * i / N) mod 360   // i = 0 … N−1
color_i = hsl(hue_i, saturation%, lightness%)
```

The CA ring's wrap (`N−1 → 0`) coincides with the hue wheel's wrap, so the
loop seam never clashes (the reason a hue-ring beats a linear gradient here).
Colors are precomputed into an RGBA LUT on `setup` and on any live color/N
change; the render loop indexes the LUT, never recomputes HSL per cell.

---

## 5. Presets (declared data)

- **Palette** group — patches the `color` group whole (top-level spread, so the
  nested object is replaced as a unit): Rainbow (span 360), Sunset (warm arc),
  Ice (cyan→blue arc), Lava (red→yellow arc), Mono (narrow span, low sat).
- **Pattern** group (optional) — patches `field` / `colors` / `dominanceReach`
  / `threshold`: Classic (square, N≈12, k1, T1), Spiral (hex, N≈8, k1, T2),
  RPS (hex, N≈6, k2, T2), Broad (hex, N≈10, k1, T3).

`matchPresets` flips a group to "Custom" on manual drift (equal key-sets per
group — satisfied here).

---

## 6. Live-apply vs structural (`update()`)

`diversion.update?(state, config, size)`:

- **Live** (mutate state, no realloc, return truthy): `threshold`, `speed`,
  `dominanceReach` (params); `color` group + `background` (recompute color
  LUT); — none of these change grid dimensions or the state space.
- **Structural** (return false → framework runs teardown + `setup` + reseed):
  `field`, `cellSize` (grid geometry), `colors`/N (state-space size → reseed
  noise). A grid rebuild re-seeds uniform random noise.

State carries `cfg` (current config snapshot) so `update` can diff cheaply and
swap live params in place.

---

## 7. Rendering

- 2D canvas, **DPR-scaled** (size backing store to `cssW*dpr`,
  `setTransform(dpr,…)`, reapply on resize) — reuse the squiral/HiDPI pattern.
- **Seamless tiling, no inter-cell gap** — spiral waves must read as continuous
  color fields; gaps would fragment the wavefront. Each `drawCell` fully covers
  its cell.
- Per tick: advance the CA at `speed` steps/sec (accumulate `dt`; step when the
  accumulator crosses the step interval — decoupled from frame rate), then
  redraw changed cells (or full redraw — profile; full redraw of a ~10px grid
  is cheap and simplest, optimize to dirty-cell only if needed).
- On first paint and structural rebuild: fill `background`, seed noise, draw all
  cells.

---

## 8. Testing (anti-regression)

Co-located Vitest `*.test.ts`:

1. **Tessellation per field** — correct neighbor count for interior cells
   (4 / 6 / 3); reciprocal adjacency (`b ∈ nbr(a) ⇒ a ∈ nbr(b)`); border cells
   have fewer, never more.
2. **CA step determinism** — seeded RNG → identical grid after K steps
   (snapshot a hash). Guards the synchronous double-buffer.
3. **Clamping** — `k_eff = ⌊(N−1)/2⌋` ceiling; `T_eff` ≤ field neighbor count.
4. **Hue-ring** — N hues evenly spaced, wrap correct, RGBA LUT length N.
5. **Codec round-trip** — every field encodes/decodes (framework keystone;
   add the leaf-key uniqueness guard if any new leaf names collide).

Per the CI gotcha: hoist assertions out of large sim loops (track worst-case in
locals, assert once after) so the determinism test doesn't time out on CI.

---

## 9. Reuse vs new

- **Reuse:** grid sizing, `RGBA`/hex helpers, `mix`/`rgba` color utils, the
  render-loop scaffold, DPR handling (from `squiral` / framework `color.ts`).
- **New:** the three tessellation modules, the hue-ring generator, the
  synchronous double-buffered CA step.

---

## 10. Future (explicitly NOT in v1)

- **Literal per-matchup predation editor** — toggle "color X also eats color
  Y" for asymmetric, hand-authored dominance. Needs the project's first bespoke
  SchemaForm control + an edge-set URL codec + a readable-at-16-colors UI. Its
  own design slice if pursued.
- **Neighbor range R > 1** — counting neighbors within distance R yields giant
  smooth spirals, but is heavier and awkward on triangle/hex. Backlog.

---

## Appendix — credit

Header credit (clean-room): "After the xscreensaver hack *demon* — David
Griffeath's cyclic cellular automaton. Reimplemented from the published
algorithm, not the original source." Confirm the exact author attribution
against the `hacks/demon.c` source header at port time.
