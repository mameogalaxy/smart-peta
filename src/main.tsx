import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './lib/store.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ConfirmProvider } from './lib/confirm.tsx'

// 端末ストレージを「永続」に昇格させ、iOS/ブラウザの自動削除(7日ルール等)で
// データが消えにくくする（ベストエフォート）。
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((p) => {
    if (!p) navigator.storage.persist().catch(() => {})
  }).catch(() => {})
}

// HashRouter を採用：GitHub Pages のサブパス・単体HTML(file://)・任意の静的ホストの
// どこでも、SPAフォールバック不要でディープリンク(QRの /d/:id)まで動く。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <StoreProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </StoreProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
)
