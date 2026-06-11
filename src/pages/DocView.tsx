import { Link, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { ICON_SRC } from '../brand'
import { CategoryIcon } from '../components/CategoryIcon'
import { DOC_CATEGORIES } from '../types'
import { formatJpDate } from '../lib/util'

/**
 * 家族がQRコードから飛んでくる単体ビュー。
 * （データは端末ローカルのため、同一端末/ブラウザで開いた場合に表示されます。
 *  実運用ではバックエンド同期に差し替えるポイント。）
 */
export function DocView() {
  const { id } = useParams()
  const { state } = useStore()
  const doc = state.docs.find((d) => d.id === id)

  if (!doc) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <img src={ICON_SRC} alt="" className="h-14 w-14 rounded-xl" />
        <h1 className="text-lg font-bold text-slate-700">書類が見つかりません</h1>
        <p className="text-sm text-slate-400">
          この端末にデータがないか、削除された可能性があります。
        </p>
        <Link to="/" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">
          ホームへ
        </Link>
      </div>
    )
  }

  const cat = DOC_CATEGORIES.find((c) => c.id === doc.category)

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-100">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <img src={ICON_SRC} alt="" className="h-8 w-8 rounded-lg" />
        <div className="text-sm font-extrabold text-slate-800">スマートピタ</div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: cat?.color, backgroundColor: `${cat?.color}1a` }}>
          <CategoryIcon cat={doc.category} size={13} /> {cat?.label}
        </span>
      </header>

      <main className="space-y-4 p-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">{doc.title}</h1>
          <p className="text-xs text-slate-400">取り込み: {formatJpDate(new Date(doc.createdAt).toISOString().slice(0, 10))}</p>
        </div>
        {doc.image && (
          <a href={doc.image} target="_blank" rel="noopener" className="block">
            <img src={doc.image} alt={doc.title} className="w-full rounded-2xl ring-1 ring-slate-200" />
            <span className="mt-1 block text-center text-[11px] text-slate-400">タップで拡大</span>
          </a>
        )}
        {doc.note && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <p className="text-xs font-bold text-slate-400">メモ</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{doc.note}</p>
          </div>
        )}
        {doc.summary && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <p className="text-xs font-bold text-slate-400">要約</p>
            <p className="mt-1 text-slate-700">{doc.summary}</p>
          </div>
        )}
        {doc.text && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <p className="mb-1 text-xs font-bold text-slate-400">内容</p>
            <pre className="whitespace-pre-wrap text-sm text-slate-600">{doc.text}</pre>
          </div>
        )}
        <Link to="/" className="block rounded-xl bg-brand-500 py-3 text-center text-sm font-semibold text-white">
          アプリで開く
        </Link>
      </main>
    </div>
  )
}
