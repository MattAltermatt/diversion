import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Gallery } from './routes/Gallery'
import { ConfigScreen } from './routes/ConfigScreen'
import { PlayScreen } from './routes/PlayScreen'

// import.meta.env.BASE_URL is '/diversion/' in the Pages build, '/' in dev.
const baseUrl = import.meta.env.BASE_URL
const basename = baseUrl === '/' ? undefined : baseUrl.replace(/\/$/, '')

const router = createBrowserRouter(
  [
    { path: '/', element: <Gallery /> },
    { path: '/d/:slug', element: <ConfigScreen /> },
    { path: '/d/:slug/play', element: <PlayScreen /> },
  ],
  { basename },
)

export default function App() {
  return <RouterProvider router={router} />
}
