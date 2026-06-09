import { Link } from 'react-router-dom'
import { ICON_SRC } from '../brand'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <img src={ICON_SRC} alt="" className="h-14 w-14 rounded-2xl opacity-90" />
      <h1 className="text-lg font-bold text-slate-700">ページが見つかりません</h1>
      <Link to="/" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">
        ホームへ戻る
      </Link>
    </div>
  )
}
