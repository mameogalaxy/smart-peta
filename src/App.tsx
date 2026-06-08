import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Documents } from './pages/Documents'
import { Calendar } from './pages/Calendar'
import { Meals } from './pages/Meals'
import { Shopping } from './pages/Shopping'
import { Settings } from './pages/Settings'
import { DocView } from './pages/DocView'
import { NotFound } from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      {/* 家族がQRから飛ぶ単体ビュー（ナビ無し） */}
      <Route path="/d/:id" element={<DocView />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Documents />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/meals" element={<Meals />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
