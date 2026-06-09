import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Card, Badge, EmptyState, Button, Modal } from '../components/ui'
import { QrModal } from '../components/QrModal'
import { ImageLightbox } from '../components/ImageLightbox'
import { DOC_CATEGORIES, type DocCategory, type DocItem } from '../types'
import { formatJpDate, fileToDataUrl, downscaleImage } from '../lib/util'
import { CameraIcon, DocIcon, GridIcon, PrinterIcon, QrIcon, TrashIcon } from '../components/icons'
import { CategoryIcon } from '../components/CategoryIcon'
import { useConfirm } from '../lib/confirm'
import { makeQrDataUrl, docShareUrl } from '../lib/qr'
import { printHtml, escapeHtml } from '../lib/print'
import { ICON_SRC } from '../brand'
import type { ReactNode } from 'react'

export function Documents() {
  const { state, removeDoc, updateDoc } = useStore()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const active = (params.get('cat') as DocCategory | null) ?? 'all'
  const [qrDoc, setQrDoc] = useState<DocItem | null>(null)
  const [detail, setDetail] = useState<DocItem | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showOcr, setShowOcr] = useState(false)
  const detailFileRef = useRef<HTMLInputElement>(null)

  async function onDetailImage(file: File) {
    if (!detail) return
    const raw = await fileToDataUrl(file)
    const small = await downscaleImage(raw).catch(() => raw)
    updateDoc(detail.id, { image: small })
    setDetail({ ...detail, image: small })
  }

  const [printing, setPrinting] = useState(false)
  async function printSheet() {
    if (!docs.length || printing) return
    setPrinting(true)
    try {
      const cards = await Promise.all(
        docs.map(async (d) => {
          const url = docShareUrl(state.settings.shareBaseUrl, d.id)
          const qr = await makeQrDataUrl(url, 320)
          const cat = DOC_CATEGORIES.find((c) => c.id === d.category)
          return { title: d.title, qr, color: cat?.color || '#3b82f6', label: cat?.label || '' }
        }),
      )
      const cardHtml = cards
        .map(
          (c) => `<div class="card">
  <div class="brand"><img src="${ICON_SRC}"><span>スマートピタ</span></div>
  <div class="cat" style="background:${c.color}">${escapeHtml(c.label)}</div>
  <div class="title">${escapeHtml(c.title)}</div>
  <img class="qr" src="${c.qr}">
  <div class="hint">スマホで読み取り → 最新表示</div>
</div>`,
        )
        .join('')
      const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>QRまとめ印刷</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:10mm}
  body{font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP',system-ui,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
  .card{border:1px dashed #94a3b8;border-radius:5mm;padding:5mm 4mm;text-align:center;break-inside:avoid}
  .brand{display:flex;align-items:center;justify-content:center;gap:1.5mm;font-weight:800;font-size:9pt;color:#0f172a;margin-bottom:1.5mm}
  .brand img{width:6mm;height:6mm}
  .cat{display:inline-block;color:#fff;border-radius:999px;padding:0.5mm 3mm;font-size:7.5pt;font-weight:700}
  .title{font-size:10.5pt;font-weight:700;margin:1.5mm 0;line-height:1.3}
  .qr{width:42mm;height:42mm}
  .hint{font-size:7pt;color:#64748b;margin-top:1mm}
</style></head>
<body><div class="grid">${cardHtml}</div>
<script>window.onload=function(){setTimeout(function(){window.focus();window.print()},300)}</script></body></html>`
      printHtml(html)
    } finally {
      setPrinting(false)
    }
  }

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

      {docs.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{docs.length}件</span>
          <Button variant="soft" onClick={printSheet} disabled={printing}>
            <PrinterIcon width={16} height={16} /> {printing ? '準備中…' : 'QRをまとめて印刷'}
          </Button>
        </div>
      )}

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
            <input
              ref={detailFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onDetailImage(f)
                e.target.value = ''
              }}
            />
            {detail.image ? (
              <div>
                <button onClick={() => setLightbox(detail.image!)} className="block w-full">
                  <img src={detail.image} alt="" className="max-h-80 w-full rounded-xl object-contain ring-1 ring-slate-200" />
                </button>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">タップで拡大</span>
                  <button onClick={() => detailFileRef.current?.click()} className="text-xs font-semibold text-brand-600">
                    画像を差し替え
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => detailFileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-slate-400 active:bg-slate-50"
              >
                <CameraIcon width={28} height={28} />
                <span className="text-sm font-semibold">写真を追加</span>
              </button>
            )}

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-400">要約</p>
              <p className="mt-1 text-sm text-slate-700">{detail.summary}</p>
            </div>

            {detail.text && (
              <div>
                <button
                  onClick={() => setShowOcr((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-slate-400"
                >
                  読み取った文字（OCR）
                  <span className="text-slate-400">{showOcr ? '隠す ▲' : '表示 ▼'}</span>
                </button>
                {showOcr && (
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200">
                    {detail.text}
                  </pre>
                )}
              </div>
            )}

            <Button className="w-full" onClick={() => { setQrDoc(detail); setDetail(null) }}>
              <QrIcon width={18} height={18} /> 冷蔵庫に貼るQRを発行
            </Button>
          </div>
        )}
      </Modal>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
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
