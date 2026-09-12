import { useEffect } from 'react'

/** The title a route should carry, given the piece it is showing. Pure, so the naming
 *  is testable without mounting a route. */
export function diversionTitle(title: string | undefined, mode: 'play' | 'config'): string {
  if (!title) return 'Diversion'
  return mode === 'play' ? `${title} — Diversion` : `${title} settings — Diversion`
}

/** Set `document.title` for the life of a route (SC 2.4.2, Level A).
 *
 *  `index.html` sets `<title>Diversion</title>` and, before #306, nothing ever wrote
 *  it again — so all three routes, which are distinct bookmarkable URLs, reported an
 *  identical title. On an SPA that costs more than the conformance line: a screen
 *  reader announces the title on navigation, so moving between diversions produced no
 *  confirmation that the view had changed at all, and every history entry, tab and
 *  bookmark read "Diversion".
 *
 *  Restores the previous title on unmount rather than leaving the last piece's name
 *  behind, so navigating back to the gallery does not keep announcing a piece that is
 *  no longer on screen. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
