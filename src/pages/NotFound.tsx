import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-5xl">🧲</p>
      <h1 className="text-lg font-bold text-slate-700">ページが見つかりません</h1>
      <Link to="/" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">
        ホームへ戻る
      </Link>
    </div>
  )
}
