import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './lib/store.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ConfirmProvider } from './lib/confirm.tsx'

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
