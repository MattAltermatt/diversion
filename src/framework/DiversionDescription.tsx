import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'

/** How many lines the collapsed description shows before it clamps (#315).
 *
 *  Five, not three or four, because it is the point where the *median* piece
 *  (163 characters — a line holds ~38 at the 320px panel's mono) reads in full
 *  and the toggle becomes the exception rather than the default: 44 of the 138
 *  descriptions overflow it, against 74 at four lines and 103 at three. A
 *  gallery that opens three-quarters truncated reads as an app hiding things.
 *
 *  Exported so the CSS can't drift from the measurement: the value is written
 *  into `--desc-lines` below and `theme.css` clamps to `var(--desc-lines)`, so
 *  there is one source for both. */
export const DESC_CLAMP_LINES = 5

/** The scroller the element actually lives in. The Config screen has two,
 *  depending on the viewport: `.config-panel` scrolls internally above 820px,
 *  and below it (#284) the panel is `overflow-y: visible` and the document
 *  scrolls instead. Walk up rather than assume either one. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/**
 * The piece's own `meta.description` — the same sentence the gallery card
 * renders — under the title on the Config screen (#315). A deep link is the
 * case that matters: whoever opens a shared config URL never saw the card, so
 * this is the only thing on screen saying what the piece is.
 *
 * Clamped to `DESC_CLAMP_LINES` with a more/less toggle, and the toggle is
 * rendered **only when the text actually overflows** — so a 54-character piece
 * never grows a control it doesn't need.
 */
export function DiversionDescription({ description }: { description: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Height of the block captured just before a collapse, so the layout effect
  // below can tell how much vanished. null when no collapse is pending.
  const collapsingFrom = useRef<number | null>(null)
  const textId = useId()

  // Measure against the clamp height rather than `scrollHeight > clientHeight`,
  // which is only true while collapsed — this has to stay correct once expanded
  // too, or a resize while open would drop the button.
  const measure = useCallback(() => {
    const el = textRef.current
    if (!el) return
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight)
    // 'normal' (and jsdom, which computes no layout) parse to NaN. Fail soft:
    // no measurement means no toggle, and the full text simply shows.
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return setOverflows(false)
    setOverflows(el.scrollHeight > lineHeight * DESC_CLAMP_LINES + 1)
  }, [])

  // Re-measure on WIDTH changes as well as on a new description: the same
  // sentence overflows five lines at the 320px panel and fits at 390px, where
  // a line holds ~47 characters instead of ~38.
  //
  // Width, specifically — the observed element is the one whose HEIGHT this
  // component just changed (applying `.is-clamped` takes the <p> from 13 lines
  // to 5), so an unfiltered observer re-fires on its own output. It happens to
  // converge, because a clamped `-webkit-box` still reports the full content
  // height in `scrollHeight` — but resting on that would make a browser detail
  // load-bearing for termination rather than just for correctness. Gating on a
  // changed width removes the feedback path outright.
  useLayoutEffect(() => {
    measure()
    const el = textRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === lastWidth) return
      lastWidth = w
      measure()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, description])

  // Collapsing removes height ABOVE wherever the reader is, so everything below
  // drags upward and they lose their place. Give the scroller that height back.
  // Runs after the DOM has re-clamped, so the shrink is measurable rather than
  // predicted. The description sits at the very top of the panel, so when it is
  // on screen scrollTop is ~0 and the clamp makes this a no-op — the block just
  // reflows, which is what it should do.
  useLayoutEffect(() => {
    const before = collapsingFrom.current
    collapsingFrom.current = null
    const box = boxRef.current
    if (before == null || expanded || !box) return
    const removed = before - box.offsetHeight
    if (removed <= 0) return
    const sc = scrollerOf(box)
    sc.scrollTop = Math.max(0, sc.scrollTop - removed)
  }, [expanded])

  const toggle = () => {
    if (expanded) collapsingFrom.current = boxRef.current?.offsetHeight ?? null
    setExpanded((e) => !e)
  }

  const clamped = overflows && !expanded

  return (
    <div
      ref={boxRef}
      className={`config-desc${clamped ? ' is-clamped' : ''}`}
      style={{ '--desc-lines': DESC_CLAMP_LINES } as React.CSSProperties}
    >
      <p className="config-desc-text" id={textId} ref={textRef}>
        {description}
      </p>
      {overflows && (
        <button
          type="button"
          className="config-desc-more"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={toggle}
        >
          {expanded ? 'less ▴' : 'more ▾'}
        </button>
      )}
    </div>
  )
}
