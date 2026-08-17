import { Link } from 'react-router-dom'

/** Recover from a diversion chunk that failed to load (#292).
 *
 *  This is a RELOAD, not a re-import, and that is not laziness — a re-import cannot
 *  work. Measured in Chrome against a URL that 404s:
 *
 *    three `import()` calls of the same failing URL -> ONE network request
 *
 *  The HTML spec's module map records the failure against the URL, so every later
 *  `import()` of that specifier rejects from cache without touching the network.
 *  Dropping the registry's memoized rejection therefore buys nothing: the remount
 *  would replay the same failure with no fetch. Only a new document (or a new URL,
 *  which the content-hashed glob loaders cannot produce) gets a fresh module map.
 *
 *  It is also the right answer for the realistic cause. A chunk 404s when a deploy
 *  replaced its hashed filename under a tab still running the old `index.html` — and
 *  that document has more problems than one missing chunk. Nothing is lost by
 *  reloading: this app's whole state is in the URL.
 *
 *  The service-worker `update()` first is what makes ONE press enough. The SW is
 *  `registerType: 'autoUpdate'` but nothing imports `virtual:pwa-register`, so an
 *  open tab keeps its old precached `index.html` until something prompts a check;
 *  without this the first reload can be served the same stale document. Fail-soft
 *  throughout — no SW in dev, none on an unsupported browser, and a rejected update
 *  must still reload. */
export async function reloadForFreshChunks(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch {
    // A failed update check is not a reason to withhold the reload.
  }
  location.reload()
}

/** Route-level fallback for `DiversionErrorBoundary` when a /d/:slug route's chunk
 *  fails (#288 made these routes suspend on a network fetch; #292 gave them a way
 *  out). Distinct from the boundary's default inline note, which is sized for one
 *  gallery tile — here the failure is the whole screen, so it says what happened and
 *  offers both directions: forward through a reload, or back to the gallery, which
 *  still works because every diversion's identity is already in the entry bundle. */
export function RouteLoadError({ onRetry = reloadForFreshChunks }: { onRetry?: () => void }) {
  return (
    <div className="route-error" role="alert">
      <div className="route-error-body">
        <p className="route-error-title">This diversion didn&rsquo;t load.</p>
        <p className="route-error-hint">
          It may have been updated since this page was opened. Reloading usually fixes it.
        </p>
        <div className="route-error-actions">
          <button type="button" onClick={onRetry}>
            Try again
          </button>
          <Link to="/">← All diversions</Link>
        </div>
      </div>
    </div>
  )
}
