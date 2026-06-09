import { useEffect, useRef } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useStore } from './lib/store'
import { decodeInvite } from './lib/firebase'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Documents } from './pages/Documents'
import { Calendar } from './pages/Calendar'
import { Meals } from './pages/Meals'
import { Shopping } from './pages/Shopping'
import { Settings } from './pages/Settings'
import { DocView } from './pages/DocView'
import { NotFound } from './pages/NotFound'

/** 招待リンク(?invite=...)で開いたとき、Firebase設定+世帯参加を自動適用 */
function InviteHandler() {
  const store = useStore()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const inv = new URLSearchParams(window.location.search).get('invite')
    if (!inv) return
    const dec = decodeInvite(inv)
    if (!dec) return
    void (async () => {
      try {
        await store.joinHousehold(dec.h, dec.c)
      } catch (e) {
        console.error(e)
      }
      const clean = window.location.origin + window.location.pathname + (window.location.hash || '')
      window.history.replaceState({}, '', clean)
    })()
  }, [store])
  return null
}

export default function App() {
  return (
    <>
      <InviteHandler />
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
    </>
  )
}
