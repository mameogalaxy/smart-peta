import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Card, Badge, EmptyState, Button, Field, Modal, Spinner, inputClass } from '../components/ui'
import { QrModal } from '../components/QrModal'
import { ImageLightbox } from '../components/ImageLightbox'
import { DOC_CATEGORIES, type DocCategory, type DocItem } from '../types'
import { formatJpDate, fileToDataUrl, downscaleImage, isPdfDataUrl, todayISO, uid } from '../lib/util'
import { scanDocument, GeminiError } from '../lib/gemini'
import { CameraIcon, CheckIcon, DocIcon, GridIcon, PlusIcon, PrinterIcon, QrIcon, SparkleIcon, TrashIcon } from '../components/icons'
import { CategoryIcon } from '../components/CategoryIcon'
import { extractDates } from '../lib/classify'
import { useConfirm } from '../lib/confirm'
import { makeQrDataUrl, docShareUrl } from '../lib/qr'
import { printHtml, escapeHtml } from '../lib/print'
import { ICON_SRC } from '../brand'
import type { ReactNode } from 'react'

export function Documents() {
  const store = useStore()
  const { state, removeDoc, updateDoc, addEvent } = store
  const aiSettings = store.aiSettings
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const active = (params.get('cat') as DocCategory | null) ?? 'all'
  const [qrDoc, setQrDoc] = useState<DocItem | null>(null)
  const [detail, setDetail] = useState<DocItem | null>(null)
  const [detailNote, setDetailNote] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showOcr, setShowOcr] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeMsg, setReanalyzeMsg] = useState('')
  const detailFileRef = useRef<HTMLInputElement>(null)

  function openDetail(doc: DocItem) {
    setDetail(doc)
    setDetailNote(doc.note ?? '')
  }

  function saveDetailNote() {
    if (!detail) return
    const note = detailNote.trim()
    if ((detail.note ?? '') === note) return
    const patch = { note: note || undefined }
    updateDoc(detail.id, patch)
    setDetail({ ...detail, ...patch })
  }

  function closeDetail() {
    saveDetailNote()
    setDetail(null)
    setReanalyzeMsg('')
    setShowOcr(false)
  }

  /** 詳細の画像リスト（images優先・無ければimage1枚） */
  function detailImages(d: DocItem): string[] {
    if (d.images && d.images.length) return d.images
    return d.image ? [d.image] : []
  }

  function setDetailImages(next: string[]) {
    if (!detail) return
    const patch = { image: next[0] ?? '', images: next.length > 1 ? next : undefined }
    updateDoc(detail.id, patch)
    setDetail({ ...detail, ...patch })
  }

  async function onDetailImages(files: FileList) {
    if (!detail) return
    const adds: string[] = []
    for (const f of Array.from(files)) {
      const raw = await fileToDataUrl(f)
      adds.push(await downscaleImage(raw).catch(() => raw))
    }
    setDetailImages([...detailImages(detail), ...adds])
  }

  function removeDetailImage(i: number) {
    if (!detail) return
    setDetailImages(detailImages(detail).filter((_, j) => j !== i))
  }

  /** 詳細の画像をAIで再読み込み（要約・分類・OCRを更新。画像はそのまま） */
  async function reanalyzeDetail() {
    if (!detail || reanalyzing) return
    const imgs = detailImages(detail).filter((x) => !isPdfDataUrl(x))
    if (!imgs.length) {
      setReanalyzeMsg('読み込める画像がありません。')
      return
    }
    setReanalyzing(true)
    setReanalyzeMsg('')
    try {
      const res = await scanDocument(imgs, aiSettings, todayISO())
      const patch = { title: res.title || detail.title, category: res.category, summary: res.summary, text: res.text }
      updateDoc(detail.id, patch)
      setDetail({ ...detail, ...patch })
      setReanalyzeMsg('AIで読み込み直しました。')
    } catch (e) {
      setReanalyzeMsg(
        e instanceof GeminiError && e.message === 'NO_KEY'
          ? 'APIキー未設定のため再読み込みできません（設定から登録）。'
          : e instanceof Error
            ? e.message
            : '再読み込みに失敗しました。',
      )
    } finally {
      setReanalyzing(false)
    }
  }

  const detectedEvents = detail ? extractDates(detail.text, todayISO()) : []
  function eventAdded(ev: { title: string; date: string }) {
    return !!detail && state.events.some((e) => e.docId === detail.id && e.date === ev.date && e.title === ev.title)
  }
  function addDocEvent(ev: { title: string; date: string; time?: string; note?: string }) {
    if (!detail || eventAdded(ev)) return
    addEvent({
      id: uid(),
      title: ev.title,
      date: ev.date,
      time: ev.time,
      note: ev.note,
      category: detail.category,
      docId: detail.id,
      remind: true,
      remindMinutes: 10,
      done: false,
      createdAt: Date.now(),
    })
  }

  const [printing, setPrinting] = useState(false)
  const [printPicker, setPrintPicker] = useState(false)
  const [printSel, setPrintSel] = useState<Set<string>>(new Set())
  const appUrl = (state.settings.shareBaseUrl || window.location.origin + window.location.pathname).replace(/[?#].*$/, '')

  async function doPrint(items: { title: string; url: string; color: string; label: string }[]) {
    if (!items.length || printing) return
    setPrinting(true)
    try {
      const cards = await Promise.all(
        items.map(async (it) => {
          const qr = await makeQrDataUrl(it.url, 320)
          return { title: it.title, qr, color: it.color, label: it.label }
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

  // 印刷できるQR一覧（アプリ・予定・各書類）
  const printItems = useMemo(() => {
    const items: { id: string; title: string; url: string; color: string; label: string }[] = [
      { id: 'app', title: `${state.settings.householdName}の掲示板`, url: appUrl, color: '#3b82f6', label: 'アプリ' },
      { id: 'schedule', title: `${state.settings.householdName}の予定`, url: `${appUrl}#/calendar`, color: '#6366f1', label: '予定' },
    ]
    for (const d of docs) {
      const cat = DOC_CATEGORIES.find((c) => c.id === d.category)
      items.push({
        id: `doc:${d.id}`,
        title: d.title,
        url: docShareUrl(state.settings.shareBaseUrl, d.id),
        color: cat?.color || '#3b82f6',
        label: cat?.label || '書類',
      })
    }
    return items
  }, [docs, state.settings.householdName, state.settings.shareBaseUrl, appUrl])

  function openPrintPicker() {
    setPrintSel(new Set(printItems.map((i) => i.id)))
    setPrintPicker(true)
  }
  function togglePrint(id: string) {
    setPrintSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
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

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{docs.length}件</span>
        <Button variant="soft" onClick={openPrintPicker} disabled={printing}>
          <PrinterIcon width={16} height={16} /> {printing ? '準備中…' : 'QRをまとめて印刷'}
        </Button>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={<DocIcon width={40} height={40} />}
          title="書類がありません"
          desc="下の ＋ ボタン →「書類を登録」から、写真またはメモで取り込みましょう。"
        />
      ) : (
        <div className="space-y-2.5">
          {docs.map((d) => {
            const cat = DOC_CATEGORIES.find((c) => c.id === d.category)
            return (
              <Card key={d.id} className="overflow-hidden">
                <div className="flex">
                  <button onClick={() => openDetail(d)} className="flex flex-1 gap-3 p-3 text-left">
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
                      <p className="line-clamp-2 text-xs text-slate-400">{d.note || d.summary || 'メモなし'}</p>
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

      <Modal open={!!detail} onClose={closeDetail} title={detail?.title}>
        {detail && (
          <div className="space-y-3">
            <input
              ref={detailFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) void onDetailImages(e.target.files)
                e.target.value = ''
              }}
            />
            {(() => {
              const imgs = detailImages(detail)
              if (imgs.length === 0) {
                return (
                  <button
                    onClick={() => detailFileRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-slate-400 active:bg-slate-50"
                  >
                    <CameraIcon width={28} height={28} />
                    <span className="text-sm font-semibold">写真を追加</span>
                  </button>
                )
              }
              return (
                <div>
                  <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-xl">
                    {imgs.map((src, i) => (
                      <div key={i} className="relative w-full shrink-0 snap-center">
                        <button onClick={() => setLightbox(src)} className="block w-full">
                          <img src={src} alt="" className="max-h-80 w-full rounded-xl object-contain ring-1 ring-slate-200" />
                        </button>
                        <span className="absolute left-2 top-2 rounded-full bg-slate-900/55 px-2 py-0.5 text-[11px] font-bold text-white">
                          {i + 1}/{imgs.length}
                        </span>
                        <button
                          onClick={() => removeDetailImage(i)}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/55 text-white active:bg-red-500"
                          aria-label="この写真を削除"
                        >
                          <TrashIcon width={15} height={15} />
                        </button>
                      </div>
                    ))}
                    {/* タップで写真追加 */}
                    <button
                      onClick={() => detailFileRef.current?.click()}
                      className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 text-brand-500"
                    >
                      <PlusIcon width={28} height={28} />
                      <span className="text-sm font-semibold">写真を追加</span>
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {imgs.length > 1 ? 'スワイプで切替／タップで拡大' : 'タップで拡大'}
                    </span>
                    <button onClick={() => detailFileRef.current?.click()} className="text-xs font-semibold text-brand-600">
                      ＋ 写真を追加
                    </button>
                  </div>
                  <Button
                    variant="soft"
                    className="mt-2 w-full"
                    disabled={reanalyzing}
                    onClick={() => void reanalyzeDetail()}
                  >
                    {reanalyzing ? <Spinner /> : <SparkleIcon width={18} height={18} />}
                    {reanalyzing ? 'AIで再読み込み中…' : 'この写真をAIで再読み込み'}
                  </Button>
                  {reanalyzeMsg && <p className="mt-1 text-center text-[11px] text-slate-400">{reanalyzeMsg}</p>}
                </div>
              )
            })()}

            <Field label="メモ" hint="変更はこの欄を離れた時に保存されます。">
              <textarea
                className={`${inputClass} min-h-24`}
                value={detailNote}
                onChange={(e) => setDetailNote(e.target.value)}
                onBlur={saveDetailNote}
                placeholder="この書類についてのメモ"
              />
            </Field>

            {detail.summary && (
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-400">要約</p>
                <p className="mt-1 text-sm text-slate-700">{detail.summary}</p>
              </div>
            )}

            {detectedEvents.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-400">日程・実施期間</p>
                  <button
                    onClick={() => detectedEvents.forEach((ev) => addDocEvent(ev))}
                    className="text-xs font-semibold text-brand-600"
                  >
                    すべて予定に追加
                  </button>
                </div>
                <div className="space-y-2">
                  {detectedEvents.map((ev, i) => {
                    const added = eventAdded(ev)
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-700">{ev.title}</p>
                          <p className="text-xs text-slate-400">
                            {formatJpDate(ev.date)} {ev.time ?? ''} {ev.note ?? ''}
                          </p>
                        </div>
                        <button
                          onClick={() => addDocEvent(ev)}
                          disabled={added}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
                            added ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-700 active:bg-brand-100'
                          }`}
                        >
                          {added ? (
                            <>
                              <CheckIcon width={14} height={14} /> 追加済み
                            </>
                          ) : (
                            <>
                              <PlusIcon width={14} height={14} /> 予定に追加
                            </>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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

            <Button className="w-full" onClick={() => {
              const note = detailNote.trim()
              if ((detail.note ?? '') !== note) updateDoc(detail.id, { note: note || undefined })
              setQrDoc({ ...detail, note: note || undefined })
              setDetail(null)
            }}>
              <QrIcon width={18} height={18} /> 冷蔵庫に貼るQRを発行
            </Button>
          </div>
        )}
      </Modal>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />

      <Modal open={printPicker} onClose={() => setPrintPicker(false)} title="まとめて印刷するQRを選ぶ">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setPrintSel(new Set(printItems.map((i) => i.id)))}>
              全て選択
            </Button>
            <Button variant="ghost" onClick={() => setPrintSel(new Set())}>
              全て解除
            </Button>
          </div>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {printItems.map((it) => {
              const on = printSel.has(it.id)
              return (
                <label
                  key={it.id}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 ${on ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200'}`}
                >
                  <input type="checkbox" checked={on} onChange={() => togglePrint(it.id)} className="h-5 w-5 accent-brand-500" />
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ color: it.color, backgroundColor: `${it.color}1a` }}
                  >
                    {it.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{it.title}</span>
                </label>
              )
            })}
          </div>
          <Button
            className="w-full"
            disabled={printSel.size === 0 || printing}
            onClick={() => {
              const sel = printItems.filter((i) => printSel.has(i.id))
              setPrintPicker(false)
              void doPrint(sel)
            }}
          >
            <PrinterIcon width={18} height={18} /> {printing ? '準備中…' : `${printSel.size}件をA4に印刷`}
          </Button>
          <p className="text-[11px] text-slate-400">
            選んだQRをA4に2列で並べて印刷します（1枚に約42mm角のQR）。冷蔵庫に貼って家族みんなで読み取れます。
          </p>
        </div>
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
