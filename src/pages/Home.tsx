import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Card, Badge, SectionTitle, EmptyState } from '../components/ui'
import { DOC_CATEGORIES } from '../types'
import type { DocItem } from '../types'
import { formatJpDate, relativeDays, todayISO } from '../lib/util'
import { QrModal } from '../components/QrModal'
import { BellIcon, CalendarIcon, CartIcon, DocIcon, MealIcon, QrIcon } from '../components/icons'

export function Home() {
  const { state } = useStore()
  const [qrDoc, setQrDoc] = useState<DocItem | null>(null)
  const today = todayISO()

  const upcoming = useMemo(
    () =>
      [...state.events]
        .filter((e) => !e.done && e.date >= today)
        .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
        .slice(0, 4),
    [state.events, today],
  )
  const todayMeal = state.meals.find((m) => m.date === today)
  const remaining = state.shopping.filter((i) => !i.checked).length
  const hour = new Date().getHours()
  const greet = hour < 5 ? 'こんばんは' : hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは'

  return (
    <div className="space-y-5">
      <div className="animate-pop">
        <p className="text-sm text-slate-400">{greet} 👋</p>
        <h1 className="text-xl font-extrabold text-slate-800">
          冷蔵庫の紙、ぜんぶデジタルに。
        </h1>
      </div>

      {/* クイック統計 */}
      <div className="grid grid-cols-3 gap-3">
        <Stat to="/docs" icon={<DocIcon width={20} height={20} />} label="書類" value={state.docs.length} />
        <Stat to="/calendar" icon={<CalendarIcon width={20} height={20} />} label="予定" value={upcoming.length} />
        <Stat to="/shopping" icon={<CartIcon width={20} height={20} />} label="買い物" value={remaining} />
      </div>

      {/* 直近の予定 */}
      <section>
        <SectionTitle action={<Link to="/calendar" className="text-xs font-semibold text-brand-600">すべて見る</Link>}>
          直近の予定・締め切り
        </SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon width={36} height={36} />}
            title="予定はありません"
            desc="プリントをスキャンすると、提出期限や行事が自動でここに並びます。"
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => {
              const cat = DOC_CATEGORIES.find((c) => c.id === e.category)
              const soon = e.date === today
              return (
                <Card key={e.id} className="flex items-center gap-3 p-3">
                  <div
                    className="flex h-12 w-12 flex-col items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: cat?.color }}
                  >
                    <span className="text-[10px] leading-none opacity-90">{formatJpDate(e.date).slice(0, -3)}</span>
                    <span className="text-base font-extrabold leading-tight">{e.date.slice(8)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{e.title}</p>
                    <p className="text-xs text-slate-400">
                      {formatJpDate(e.date)} {e.time ?? ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge color={soon ? '#ef4444' : cat?.color}>{relativeDays(e.date)}</Badge>
                    {e.remind && <BellIcon width={14} height={14} className="text-slate-300" />}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* 今日の献立 */}
      <section>
        <SectionTitle action={<Link to="/meals" className="text-xs font-semibold text-brand-600">献立を見る</Link>}>
          今日の献立
        </SectionTitle>
        <Card className="p-4">
          {todayMeal?.dinner ? (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <MealIcon width={24} height={24} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-800">{todayMeal.dinner}</p>
                {todayMeal.schoolLunch && (
                  <p className="text-xs text-slate-400">給食: {todayMeal.schoolLunch} と被らない献立</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">まだ決まっていません</p>
              <Link to="/meals" className="text-sm font-semibold text-brand-600">
                AIに提案してもらう →
              </Link>
            </div>
          )}
        </Card>
      </section>

      {/* 書類ボックス（カテゴリ別） */}
      <section>
        <SectionTitle action={<Link to="/docs" className="text-xs font-semibold text-brand-600">書類ボックス</Link>}>
          フォルダ
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {DOC_CATEGORIES.map((c) => {
            const docs = state.docs.filter((d) => d.category === c.id)
            return (
              <Link key={c.id} to={`/docs?cat=${c.id}`}>
                <Card className="flex items-center gap-3 p-3.5">
                  <span className="text-2xl">{c.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{c.label}</p>
                    <p className="text-xs text-slate-400">{docs.length}件</p>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      {/* QR即発行 */}
      {state.docs.length > 0 && (
        <section>
          <SectionTitle>冷蔵庫に貼るQR</SectionTitle>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {state.docs.slice(0, 8).map((d) => {
              const cat = DOC_CATEGORIES.find((c) => c.id === d.category)
              return (
                <button
                  key={d.id}
                  onClick={() => setQrDoc(d)}
                  className="flex w-32 shrink-0 flex-col items-start gap-2 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/70 active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${cat?.color}1a`, color: cat?.color }}>
                    <QrIcon width={20} height={20} />
                  </span>
                  <span className="line-clamp-2 text-xs font-semibold text-slate-700">{d.title}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <QrModal doc={qrDoc} onClose={() => setQrDoc(null)} />
    </div>
  )
}

function Stat({
  to,
  icon,
  label,
  value,
}: {
  to: string
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <Link to={to}>
      <Card className="flex flex-col items-center gap-1 py-3.5">
        <span className="text-brand-500">{icon}</span>
        <span className="text-2xl font-extrabold leading-none text-slate-800">{value}</span>
        <span className="text-[11px] font-semibold text-slate-400">{label}</span>
      </Card>
    </Link>
  )
}
