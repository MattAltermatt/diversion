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
        { path: '/d/:slug', element: <ConfigRoute /> },
        { path: '/d/:slug/play', element: <PlayScreen /> },
      ],
    },
  ],
  { basename },
)

export default function App() {
  return <RouterProvider router={router} />
}
