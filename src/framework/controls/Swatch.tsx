import type { FieldMeta } from '../fieldMeta'
import { splitColor, joinColor } from './ColorList'

/** Single color field (ui:'color').
 *
 *  `<input type="color">` is a SIX-hex device: its value sanitizer rewrites anything
 *  that is not `#` plus exactly six hex digits to `#000000`, and it only ever emits
 *  6-hex. So a field whose Zod node is `#rrggbbaa` (intermomentary's two inks)
 *  rendered black and un-editable, and every pick wrote a value the field's own
 *  regex rejects — which the codec then reverted on the next load (#304).
 *
 *  The alpha affordance keys off the INCOMING VALUE's length, exactly as ColorList's
 *  rows already do (`splitColor`). That is the cleanest signal available here: a
 *  control receives only `value` + `meta`, never the Zod node, so the node's regex is
 *  invisible to it — but the value is PRODUCED by that node (its default, or a URL
 *  the node validated on decode), so an 8-hex value is proof the field takes alpha
 *  and a 6-hex value is proof it does not. It needs no new meta flag and no schema
 *  edit, and it leaves the ~238 plain 6-hex fields byte-identical: they take the
 *  `hasAlpha: false` path and still emit a bare `#rrggbb`.
 *
 *  `diversionMeta.test.ts` guards the other half of that deal — a ui:'color' field
 *  whose node rejects 6-hex must carry an 8-hex default, or nothing would ever hand
 *  this control the signal and the picker would sanitize straight back to black. */
export function Swatch({
  value,
  onChange,
  meta,
}: {
  value: string
  onChange: (v: string) => void
  meta: FieldMeta
}) {
  const { rgb, alpha, hasAlpha } = splitColor(value)

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">{value}</span>
      </div>
      <input
        type="color"
        // .ctl-name is a sibling <span>, not a <label for> — without an explicit name
        // the accessible name is EMPTY (WCAG 4.1.2, Level A), the same failure Toggle
        // had in #290. Distinct from the alpha slider's name below.
        aria-label={`${meta.label} color`}
        value={rgb}
        onChange={(e) => onChange(hasAlpha ? joinColor(e.target.value, alpha) : e.target.value)}
      />
      {hasAlpha && (
        <div className="arow">
          <span className="alab">α</span>
          <input
            type="range"
            min={0}
            max={100}
            aria-label={`${meta.label} opacity`}
            value={alpha}
            onChange={(e) => onChange(joinColor(rgb, Number(e.target.value)))}
          />
          <span className="aval">{alpha}%</span>
        </div>
      )}
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
