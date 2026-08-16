import { Suspense } from 'react'
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useParams,
} from 'react-router-dom'
import { Gallery } from './routes/Gallery'
import { ConfigScreen } from './routes/ConfigScreen'
import { PlayScreen } from './routes/PlayScreen'
import { DiversionErrorBoundary } from './framework/DiversionErrorBoundary'

// import.meta.env.BASE_URL is '/diversion/' in the Pages build, '/' in dev.
const baseUrl = import.meta.env.BASE_URL
const basename = baseUrl === '/' ? undefined : baseUrl.replace(/\/$/, '')

// Key ConfigScreen by :slug so a slug change (router nav between diversions
// without unmounting) remounts it — its once-only useState initializer would
// otherwise render the new schema against the previous diversion's config.
function ConfigRoute() {
  const { slug } = useParams()
  return <ConfigScreen key={slug} />
}

// Both /d/:slug routes now suspend while their diversion's chunk loads (#288), so
// they need a boundary. Keyed by slug so a latched error cannot survive into the
// next piece.
//
// The error boundary is the load-bearing half: `useDiversion` REJECTS when a chunk
// fetch fails rather than resolving undefined, so this catches it and offers a retry
// instead of the route claiming the diversion doesn't exist. That is the classic
// long-lived-SPA failure — a deploy replaces the hashed filename under an open tab —
// and `loadDiversion` drops rejected promises from its cache precisely so the retry
// can re-import rather than replay the same failure.
//
// The fallback is a bare themed panel, not a spinner: the median diversion chunk is
// 3.4 kB gzipped, so on anything but a cold slow connection it is a sub-frame flash,
// and a spinner would read as slower than nothing.
function DiversionRoute({ children }: { children: React.ReactNode }) {
  const { slug } = useParams()
  return (
    <DiversionErrorBoundary key={slug}>
      <Suspense fallback={<div className="route-loading" />}>{children}</Suspense>
    </DiversionErrorBoundary>
  )
}

// Reset scroll on navigation, and restore it when going back (#284).
//
// The browser keeps the scroll offset across an SPA navigation, and until the
// Config screen became scrollable that was invisible: it was `height: 100vh;
// overflow: hidden`, so the retained offset had no range to land in and clamped
// to 0. Once the small-screen layout let the document scroll, opening a diversion
// from deep in the gallery dropped you at the BOTTOM of its config form — the
// retained offset, clamped to the new page's maximum.
//
// ScrollRestoration rather than a scroll-to-top effect, because the two cases
// genuinely differ: a forward navigation should start at the top, but going BACK
// to a ~50,000px gallery should return you to the tile you left, not to the
// header. It keys on location.key, so each history entry restores its own offset.
export function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter(
  [
    {
      element: <Root />,
      children: [
        { path: '/', element: <Gallery /> },
        {
          path: '/d/:slug',
          element: (
            <DiversionRoute>
              <ConfigRoute />
            </DiversionRoute>
          ),
        },
        {
          path: '/d/:slug/play',
          element: (
            <DiversionRoute>
              <PlayScreen />
            </DiversionRoute>
          ),
        },
      ],
    },
  ],
  { basename },
)

export default function App() {
  return <RouterProvider router={router} />
}
