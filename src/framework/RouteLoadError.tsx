import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'

/** How long to wait for the service-worker update check before reloading anyway.
 *  On a captive portal or a half-open connection that fetch can stay pending
 *  indefinitely, and the button must never hang with it. */
const UPDATE_TIMEOUT_MS = 2000

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
 *  Nothing is lost by reloading: this app's whole state is in the URL.
 *
 *  The service-worker `update()` first is what makes ONE press enough for the
 *  stale-deploy case. The SW is `registerType: 'autoUpdate'` but nothing imports
 *  `virtual:pwa-register`, so an open tab keeps its old precached `index.html` until
 *  something prompts a check; without this the first reload can be served the same
 *  stale document. Skipped entirely when the browser says it is offline — there the
 *  cause is the OTHER one (see `RouteLoadError`), the fetch cannot succeed, and its
 *  only effect would be to delay the reload by the timeout.
 *
 *  Fail-soft throughout: no SW in dev, none on an unsupported browser, a rejected
 *  update, and a hanging one must all still reload. */
export async function reloadForFreshChunks(): Promise<void> {
  try {
    if (navigator.onLine !== false) {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) {
        await Promise.race([
          reg.update(),
          new Promise((resolve) => setTimeout(resolve, UPDATE_TIMEOUT_MS)),
        ])
      }
    }
  } catch {
    // A failed update check is not a reason to withhold the reload.
  }
  location.reload()
}

const subscribeOnline = (onChange: () => void): (() => void) => {
  addEventListener('online', onChange)
  addEventListener('offline', onChange)
  return () => {
    removeEventListener('online', onChange)
    removeEventListener('offline', onChange)
  }
}

/** `navigator.onLine`, re-read when it changes. It is only trustworthy in the
 *  negative — false means definitely no network; true means "an interface is up",
 *  which is why this only ever softens the message rather than promising anything. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true, // server/no-DOM: assume online, i.e. show the deploy-race copy
  )
}

/** Route-level fallback for `DiversionErrorBoundary` when a /d/:slug route's chunk
 *  fails (#288 made these routes suspend on a network fetch; #292 gave them a way
 *  out). Distinct from the boundary's default inline note, which is sized for one
 *  gallery tile — here the failure IS the screen, so it says what happened and offers
 *  both directions: forward through a reload, or back to the gallery, which still
 *  works because every diversion's identity is already in the entry bundle.
 *
 *  There are TWO ways to get here and they need different words:
 *
 *   - **Online** — a deploy replaced the chunk's hashed filename under a tab still
 *     running the old `index.html`. A reload fixes it, and usually must.
 *   - **Offline** — the designed-in limit of the shell-only precache (#289): the
 *     shell is cached, so the app boots, but a piece you have never opened was never
 *     runtime-cached and cannot be fetched. A reload provably CANNOT fix this — same
 *     shell, same route, same missing chunk — so promising "reloading usually fixes
 *     it" here would be a one-button loop. Say what is actually true instead. The
 *     button stays, because connectivity can return between render and press. */
export function RouteLoadError({ onRetry = reloadForFreshChunks }: { onRetry?: () => void }) {
  const online = useOnline()
  const [retrying, setRetrying] = useState(false)

  const retry = () => {
    setRetrying(true)
    onRetry()
  }

  return (
    <div className="route-error" role="alert">
      <div className="route-error-body">
        <p className="route-error-title">This diversion didn&rsquo;t load.</p>
        <p className="route-error-hint">
          {online
            ? 'It may have been updated since this page was opened. Reloading usually fixes it.'
            : 'You’re offline, and this one hasn’t been downloaded yet. It will work once you’re back on a network — the pieces you have already watched still run.'}
        </p>
        <div className="route-error-actions">
          <button type="button" onClick={retry} disabled={retrying}>
            {retrying ? 'Reloading…' : 'Try again'}
          </button>
          <Link to="/">← All diversions</Link>
        </div>
      </div>
    </div>
  )
}
