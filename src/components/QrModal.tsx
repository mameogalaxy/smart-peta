import { useEffect, useState } from 'react'
import { Modal, Button, Spinner } from './ui'
import { makeBrandedQrDataUrl, makeQrDataUrl, docShareUrl } from '../lib/qr'
import { useStore } from '../lib/store'
import type { DocCategory, DocItem } from '../types'
import { DOC_CATEGORIES } from '../types'
import { PrinterIcon, CopyIcon, QrIcon } from './icons'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

interface QrTarget {
  title: string
  url: string
  category?: DocCategory
  dl: string
  hint: string
}

export function QrModal({
  doc,
  custom,
  onClose,
}: {
  doc?: DocItem | null
  custom?: { title: string; url: string; hint?: string } | null
  onClose: () => void
}) {
  const { state } = useStore()
  const [img, setImg] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const target: QrTarget | null = doc
    ? {
        title: doc.title,
        url: docShareUrl(state.settings.shareBaseUrl, doc.id),
        category: doc.category,
        dl: doc.id,
        hint: 'スマホのカメラでこのQRコードを読み取ると最新の情報がすぐに見られます',
      }
    : custom
      ? {
          title: custom.title,
          url: custom.url,
          dl: 'app',
          hint: custom.hint ?? 'スマホのカメラでこのQRコードを読み取るとアプリが開きます',
        }
      : null

  const url = target?.url ?? ''

  useEffect(() => {
    if (!url || !target) return
    setImg('')
    setCopied(false)
    const titleColor = target.category ? DOC_CATEGORIES.find((c) => c.id === target.category)?.color : undefined
    makeBrandedQrDataUrl(url, { title: target.title, titleColor })
      .then(setImg)
      .catch(() => makeQrDataUrl(url, 480).then(setImg).catch(() => setImg('')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  if (!target) return null

  /** ブランドQR画像を印刷用レイアウトで印刷する */
  function handlePrint() {
    if (!img || !target) return
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(target.title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{margin:12mm}
  body{font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP',system-ui,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .card{max-width:440px;margin:0 auto;padding:20px;text-align:center}
  .qr{width:100%;max-width:400px;border:1px solid #e2e8f0;border-radius:24px}
  .hint{color:#475569;font-size:15px;line-height:1.6;margin-top:16px}
  .url{margin-top:8px;font-size:11px;color:#94a3b8;word-break:break-all}
</style></head>
<body>
  <div class="card">
    <img class="qr" src="${img}" alt="QR">
    <p class="hint">${escapeHtml(target.hint)}</p>
    <p class="url">${escapeHtml(target.url)}</p>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.focus();window.print()},250)}</script>
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
    document.body.appendChild(iframe)
    const idoc = iframe.contentWindow?.document
    if (!idoc) {
      document.body.removeChild(iframe)
      return
    }
    idoc.open()
    idoc.write(html)
    idoc.close()
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 60000)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* noop */
    }
  }

  return (
    <Modal open onClose={onClose} title={doc ? '冷蔵庫に貼るQRコード' : 'QRコードを作成'}>
      <div className="flex flex-col items-center">
        <p className="mb-3 text-center text-sm text-slate-500">
          {doc ? (
            <>
              このQRを<strong>1枚だけ</strong>冷蔵庫に貼れば、家族はスマホで読み取るだけで
              <br />「{target.title}」の最新版にアクセスできます。
            </>
          ) : (
            <>このQRを印刷して貼っておけば、家族はスマホで読み取るだけでアプリを開けます。</>
          )}
        </p>

        <div className="w-full rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          {img ? (
            <img src={img} alt="QRコード" className="mx-auto w-full max-w-[280px] rounded-xl" />
          ) : (
            <div className="flex h-72 items-center justify-center text-slate-300">
              <Spinner className="text-brand-500" />
            </div>
          )}
        </div>

        <code className="mt-2 break-all rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-400">{url}</code>

        <Button className="mt-4 w-full" onClick={handlePrint} disabled={!img}>
          <PrinterIcon width={18} height={18} /> 印刷する{doc ? '（冷蔵庫に貼る）' : ''}
        </Button>

        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <Button variant="soft" onClick={copyLink}>
            <CopyIcon width={18} height={18} /> {copied ? 'コピーしました' : 'リンクをコピー'}
          </Button>
          <a
            href={img || '#'}
            download={`smartpita-qr-${target.dl}.png`}
            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 active:bg-brand-100 ${
              img ? '' : 'pointer-events-none opacity-50'
            }`}
          >
            <QrIcon width={18} height={18} /> 画像を保存
          </a>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          ※ スマートピタのロゴと名前入りQRです。印刷して冷蔵庫に貼れます。
        </p>
      </div>
    </Modal>
  )
}
