import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Card, Badge, EmptyState, Button, Modal } from '../components/ui'
import { QrModal } from '../components/QrModal'
import { DOC_CATEGORIES, type DocCategory, type DocItem } from '../types'
import { formatJpDate } from '../lib/util'
import { DocIcon, GridIcon, QrIcon, TrashIcon } from '../components/icons'
import { CategoryIcon } from '../components/CategoryIcon'
import { useConfirm } from '../lib/confirm'
import type { ReactNode } from 'react'

export function Documents() {
  const { state, removeDoc } = useStore()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const active = (params.get('cat') as DocCategory | null) ?? 'all'
  const [qrDoc, setQrDoc] = useState<DocItem | null>(null)
  const [detail, setDetail] = useState<DocItem | null>(null)

  const docs = useMemo(() => {
    const list = active === 'all' ? state.docs : state.docs.filter((d) => d.category === active)
    return [...list].sort((a, b) => b.createdAt - a.createdAt)
  }, [state.docs, active])

  function setCat(cat: string) {
    if (cat === 'all') setParams({})
    else setParams({ cat })
  }

  return (
    <div className="space-y-4">
      {/* カテゴリタブ */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={active === 'all'} onClick={() => setCat('all')} label="すべて" icon={<GridIcon width={16} height={16} />} />
        {DOC_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={active === c.id}
            onClick={() => setCat(c.id)}
            label={c.label}
            icon={<CategoryIcon cat={c.id} size={16} />}
            color={c.color}
          />
        ))}
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={<DocIcon width={40} height={40} />}
          title="書類がありません"
          desc="右下のカメラから、冷蔵庫に貼られたプリントをスキャンして取り込みましょう。"
        />
      ) : (
        <div className="space-y-2.5">
          {docs.map((d) => {
            const cat = DOC_CATEGORIES.find((c) => c.id === d.category)
            return (
              <Card key={d.id} className="overflow-hidden">
                <div className="flex">
                  <button onClick={() => setDetail(d)} className="flex flex-1 gap-3 p-3 text-left">
                    {d.image ? (
                      <img src={d.image} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                    ) : (
                      <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                        <DocIcon width={28} height={28} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge color={cat?.color}>
                          <CategoryIcon cat={d.category} size={13} /> {cat?.label}
                        </Badge>
                        <span className="text-[11px] text-slate-400">{formatJpDate(new Date(d.createdAt).toISOString().slice(0, 10))}</span>
                      </div>
                      <p className="truncate font-bold text-slate-800">{d.title}</p>
                      <p className="line-clamp-2 text-xs text-slate-400">{d.summary}</p>
                    </div>
                  </button>
                </div>
                <div className="flex border-t border-slate-100">
                  <button
                    onClick={() => setQrDoc(d)}
                    className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-brand-600 active:bg-brand-50"
                  >
                    <QrIcon width={18} height={18} /> QRを貼る
                  </button>
                  <div className="w-px bg-slate-100" />
                  <button
                    onClick={async () => {
                      if (await confirm({ title: '書類を削除', message: `「${d.title}」を削除しますか？`, danger: true })) {
                        removeDoc(d.id)
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-slate-400 active:bg-slate-50"
                  >
                    <TrashIcon width={18} height={18} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <QrModal doc={qrDoc} onClose={() => setQrDoc(null)} />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title}>
        {detail && (
          <div className="space-y-3">
            {detail.image && (
              <img src={detail.image} alt="" className="max-h-72 w-full rounded-xl object-contain ring-1 ring-slate-200" />
            )}
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-400">要約</p>
              <p className="mt-1 text-sm text-slate-700">{detail.summary}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-400">読み取った文字（OCR）</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {detail.text}
              </pre>
            </div>
            <Button className="w-full" onClick={() => { setQrDoc(detail); setDetail(null) }}>
              <QrIcon width={18} height={18} /> 冷蔵庫に貼るQRを発行
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Chip({
  active,
  onClick,
  label,
  icon,
  color = '#3b82f6',
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: ReactNode
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
        active ? 'text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
      }`}
      style={active ? { backgroundColor: color } : undefined}
    >
      {icon} {label}
    </button>
  )
}
