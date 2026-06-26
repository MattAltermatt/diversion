import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Gallery } from './routes/Gallery'
import { ConfigScreen } from './routes/ConfigScreen'
import { PlayScreen } from './routes/PlayScreen'

const router = createBrowserRouter([
  { path: '/', element: <Gallery /> },
  { path: '/d/:slug', element: <ConfigScreen /> },
  { path: '/d/:slug/play', element: <PlayScreen /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
