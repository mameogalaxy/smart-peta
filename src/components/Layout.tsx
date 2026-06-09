import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarIcon, CameraIcon, CartIcon, DocIcon, HomeIcon, MealIcon, SettingsIcon } from './icons'
import { useStore } from '../lib/store'
import { useState, type ReactNode } from 'react'
import { ScanSheet } from './ScanSheet'
import { ICON_SRC } from '../brand'

const NAV = [
  { to: '/', label: 'ホーム', Icon: HomeIcon, end: true },
  { to: '/docs', label: '書類', Icon: DocIcon },
  { to: '/calendar', label: '予定', Icon: CalendarIcon },
  { to: '/meals', label: '献立', Icon: MealIcon },
  { to: '/shopping', label: '買い物', Icon: CartIcon },
]

function NavItem({ to, label, Icon, end }: { to: string; label: string; Icon: typeof HomeIcon; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
          isActive ? 'text-brand-600' : 'text-slate-400'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
              isActive ? 'bg-brand-50' : ''
            }`}
          >
            <Icon width={22} height={22} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

export function Layout() {
  const { state } = useStore()
  const loc = useLocation()
  const [scanOpen, setScanOpen] = useState(false)
  const titles: Record<string, ReactNode> = {
    '/': null,
    '/docs': '書類ボックス',
    '/calendar': 'カレンダー',
    '/meals': '献立',
    '/shopping': '買い物リスト',
    '/settings': '設定',
  }
  const pageTitle = titles[loc.pathname] ?? null

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col bg-slate-100">
      {/* ヘッダー */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <img src={ICON_SRC} alt="" className="h-9 w-9" />
            <div className="leading-tight">
              <div className="text-base font-extrabold tracking-tight text-slate-800">
                スマートピタ
              </div>
              {pageTitle ? (
                <div className="text-[11px] font-semibold text-brand-600">{pageTitle}</div>
              ) : (
                <div className="text-[11px] text-slate-400">{state.settings.householdName}の掲示板</div>
              )}
            </div>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `rounded-full p-2 transition ${isActive ? 'bg-brand-50 text-brand-600' : 'text-slate-400 active:bg-slate-100'}`
            }
            aria-label="設定"
          >
            <SettingsIcon width={22} height={22} />
          </NavLink>
        </div>
      </header>

      {/* 本文 */}
      <main className="flex-1 px-4 py-4 pb-28">
        <Outlet />
      </main>

      {/* スキャンFAB（全画面共通の起点） */}
      <button
        onClick={() => setScanOpen(true)}
        className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 sm:left-auto sm:right-[calc(50%-14rem)] sm:translate-x-0"
        aria-label="書類をスキャン"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40 ring-4 ring-white active:scale-95">
          <CameraIcon width={26} height={26} />
        </span>
      </button>
      <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} />

      {/* ボトムナビ */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </div>
      </nav>
    </div>
  )
}
