# Preset Picker — Implementation Plan

> Implements `docs/superpowers/specs/2026-06-27-preset-picker-design.md`.
> TDD, co-located tests, commit per task.
>
> **Status: ✅ all tasks complete (2026-06-27).** Chrome MUST-gate passed
> (apply/compose/URL round-trip/Custom-on-drift), `diversion-reviewer` clean,
> 126 tests green. Awaiting user-verify before FF-merge.

**Goal:** A framework-level preset picker — diversions declare named preset
groups; the config panel renders a dropdown per group that patches config + URL.

**Stack:** Vite + React 19 + TS + Zod 4, Vitest + @testing-library/react.

**Execution:** lead-inline (tight coupling + Chrome verify dominate); code-review
phase to the `diversion-reviewer` subagent (fresh eyes, required phase).

---

### Task 1: Framework presets module + type seam

**Files:**
- Modify: `src/framework/types.ts` (add `PresetOption`, `PresetGroup`, `presets?`)
- Create: `src/framework/presets.ts` (`applyPreset`, `deepEqual`, `matchPresets`)
- Test: `src/framework/presets.test.ts`

- [ ] Add `PresetOption<Config>` / `PresetGroup<Config>` interfaces and the
      optional `presets?: PresetGroup<Config>[]` field on `Diversion`.
- [ ] Write `presets.test.ts`: `applyPreset` (flat override, `color` replaced
      wholesale, untouched fields preserved); `matchPresets` (exact→name,
      one-field tweak→null, nested color-array diff detected, two groups
      independent). Run, watch fail.
- [ ] Implement `applyPreset` (top-level spread), a recursive `deepEqual`
      (handles arrays + plain objects), and `matchPresets` (per group, find the
      option whose every patch key `deepEqual`s config; else null). Run, pass.
- [ ] Commit.

### Task 2: PresetPicker component

**Files:**
- Create: `src/framework/PresetPicker.tsx`
- Test: `src/framework/PresetPicker.test.tsx`

- [ ] RTL test: renders one labeled `<select>` per group; options = "Custom" +
      names; selecting an option calls `onApply` with `applyPreset(value, patch)`;
      shows "Custom" selected when nothing matches; renders nothing when
      `groups` is empty/undefined. Run, watch fail.
- [ ] Implement: map groups → labeled selects; current selection from
      `matchPresets`; `onChange` looks up the option and calls
      `onApply(applyPreset(value, opt.patch))`. Run, pass.
- [ ] Commit.

### Task 3: Wire into ConfigScreen + style

**Files:**
- Modify: `src/routes/ConfigScreen.tsx` (render `<PresetPicker>` above form)
- Modify: the config-panel stylesheet (label + select styling matching the form)

- [ ] Render `<PresetPicker groups={diversion.presets} value={config}
      onApply={update} />` directly above `<SchemaForm>`.
- [ ] Add CSS so the picker reads as panel chrome (labels + full-width selects,
      consistent with existing controls). No layout jump.
- [ ] Typecheck + existing tests green. Commit.

### Task 4: Flow Field declares its groups

**Files:**
- Modify: `src/diversions/flow-field/index.ts`
- Test: `src/diversions/flow-field/presets.test.ts` (the declared groups)

- [ ] Test: `flowField.presets` has two groups (Flow, Color) with 6 and 7
      options, option names match `flowPresets` / `colorPresets`. Run, fail.
- [ ] Map `flowPresets`→Flow group (`patch` = `.flow`), `colorPresets`→Color
      group (`patch` = `{ background, blend, color }`). Run, pass.
- [ ] Commit.

### Task 5: Verify, review, docs

- [ ] **Chrome verify** (lead, MUST gate): dev server on 5180, open
      `/d/flow-field`. Pick each Flow + Color preset; confirm the canvas + the
      individual controls + the URL all update; confirm a manual tweak flips the
      group to "Custom"; click-test (real interaction). Screenshot.
- [ ] **Code review:** dispatch `diversion-reviewer` subagent over the diff
      (5 UX invariants, schema-as-source-of-truth, codec keystone). Address
      blocking findings.
- [ ] **Docs:** CLAUDE.md "Architecture" note on the presets seam; README
      feature line if warranted. Mark plan tasks done.
- [ ] User-verify hand-off before FF-merge.
