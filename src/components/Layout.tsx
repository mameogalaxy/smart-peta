import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarIcon, CameraIcon, CartIcon, DocIcon, HomeIcon, MealIcon, PlusIcon, SettingsIcon } from './icons'
import { useStore } from '../lib/store'
import { useState, type ReactNode } from 'react'
import { ScanSheet } from './ScanSheet'
import { Modal } from './ui'
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
  const navigate = useNavigate()
  const [scanOpen, setScanOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const addActions: { label: string; desc: string; Icon: typeof HomeIcon; run: () => void }[] = [
    { label: '書類をスキャン', desc: '写真/貼り付けで取り込み', Icon: CameraIcon, run: () => setScanOpen(true) },
    { label: '予定を追加', desc: 'カレンダーに新規予定', Icon: CalendarIcon, run: () => navigate('/calendar?add=1') },
    { label: '買い物に追加', desc: '買い物リストへ', Icon: CartIcon, run: () => navigate('/shopping') },
    { label: '冷蔵庫を撮影', desc: '中身を登録', Icon: MealIcon, run: () => navigate('/meals') },
  ]
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

      {/* 追加FAB（全画面共通の「＋」メニュー） */}
      <button
        onClick={() => setMenuOpen(true)}
        className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 sm:left-auto sm:right-[calc(50%-14rem)] sm:translate-x-0"
        aria-label="追加"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40 ring-4 ring-white active:scale-95">
          <PlusIcon width={28} height={28} />
        </span>
      </button>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="追加する">
        <div className="space-y-2">
          {addActions.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                setMenuOpen(false)
                a.run()
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left active:bg-slate-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <a.Icon width={22} height={22} />
              </span>
              <span className="flex-1">
                <span className="block font-bold text-slate-800">{a.label}</span>
                <span className="block text-xs text-slate-400">{a.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

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
