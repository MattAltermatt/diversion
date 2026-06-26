import type { FieldMeta } from '../fieldMeta'

/**
 * Pick a fresh value for a number field. Bounded fields (rare here — those are
 * usually sliders) stay within [min, max]; open-ended fields like a seed get a
 * positive integer with plenty of variety. `rand` is injectable for tests.
 */
export function randomNumber(
  meta: { min?: number; max?: number; step?: number },
  rand: () => number = Math.random,
): number {
  const isInt = Number.isInteger(meta.step ?? 1)
  if (meta.min != null && meta.max != null) {
    const v = meta.min + rand() * (meta.max - meta.min)
    return isInt ? Math.round(v) : v
  }
  return Math.floor(rand() * 1_000_000)
}

export function NumberInput({
  value,
  onChange,
  meta,
}: {
  value: number
  onChange: (v: number) => void
  meta: FieldMeta
}) {
  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
      </div>
      <div className="num">
        <button onClick={() => onChange(value - (meta.step ?? 1))}>–</button>
        <input
          type="number"
          step={meta.step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button onClick={() => onChange(value + (meta.step ?? 1))}>+</button>
        <button
          className="num-random"
          aria-label={`Randomize ${meta.label}`}
          title={`Randomize ${meta.label}`}
          onClick={() => onChange(randomNumber(meta))}
        >
          🎲
        </button>
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
