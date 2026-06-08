import { useEffect, useState } from 'react'
import { Modal, Button, Spinner } from './ui'
import { makeQrDataUrl, docShareUrl } from '../lib/qr'
import { useStore } from '../lib/store'
import type { DocItem } from '../types'
import { DOC_CATEGORIES } from '../types'
import { QrIcon } from './icons'

export function QrModal({ doc, onClose }: { doc: DocItem | null; onClose: () => void }) {
  const { state } = useStore()
  const [qr, setQr] = useState<string>('')
  const url = doc ? docShareUrl(state.settings.shareBaseUrl, doc.id) : ''

  useEffect(() => {
    if (!doc) return
    setQr('')
    makeQrDataUrl(url, 360).then(setQr).catch(() => setQr(''))
  }, [doc, url])

  if (!doc) return null
  const cat = DOC_CATEGORIES.find((c) => c.id === doc.category)

  return (
    <Modal open={!!doc} onClose={onClose} title="冷蔵庫に貼るQRコード">
      <div className="flex flex-col items-center">
        <p className="mb-3 text-center text-sm text-slate-500">
          このQRを<strong>1枚だけ</strong>冷蔵庫に貼れば、家族はスマホで読み取るだけで
          <br />
          「{doc.title}」の最新版にアクセスできます。
        </p>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          {qr ? (
            <img src={qr} alt="QRコード" width={260} height={260} className="h-64 w-64" />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center text-slate-300">
              <Spinner className="text-brand-500" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm font-semibold" style={{ color: cat?.color }}>
          <span>{cat?.emoji}</span>
          <span className="text-slate-700">{doc.title}</span>
        </div>
        <code className="mt-2 break-all rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-400">{url}</code>

        <div className="mt-4 grid w-full grid-cols-2 gap-2">
          <Button
            variant="soft"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
              } catch {
                /* noop */
              }
            }}
          >
            リンクをコピー
          </Button>
          <a
            href={qr || '#'}
            download={`smartpeta-qr-${doc.id}.png`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white active:bg-brand-600"
          >
            <QrIcon width={18} height={18} /> 画像を保存
          </a>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          ※ 共有URLのベースは設定で変更できます。印刷して冷蔵庫にどうぞ。
        </p>
      </div>
    </Modal>
  )
}
