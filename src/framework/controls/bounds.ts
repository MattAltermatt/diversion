// bounds.ts — the one piece of numeric-field logic shared by more than one control.
// Slider and NumberInput both clamp a typed or dragged value to whichever of a field's
// [min, max] the schema declared, so it lives beside them rather than inside either
// (mirrors matrixTransforms.ts). Keeping it here is also what lets both control modules
// export nothing but their component, so React Fast Refresh still works on them (#308).

/** Keep a value inside whichever of [min, max] are defined. */
export function clampToBounds(v: number, meta: { min?: number; max?: number }): number {
  let r = v
  if (meta.min != null) r = Math.max(meta.min, r)
  if (meta.max != null) r = Math.min(meta.max, r)
  return r
}
