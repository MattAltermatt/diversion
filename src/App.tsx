import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom'
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

const router = createBrowserRouter(
  [
    { path: '/', element: <Gallery /> },
    { path: '/d/:slug', element: <ConfigRoute /> },
    { path: '/d/:slug/play', element: <PlayScreen /> },
  ],
  { basename },
)

export default function App() {
  return <RouterProvider router={router} />
}
