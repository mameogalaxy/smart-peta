import { useEffect, useState } from 'react'
import { Modal, Button, Spinner } from './ui'
import { makeQrDataUrl, docShareUrl } from '../lib/qr'
import { useStore } from '../lib/store'
import type { DocItem } from '../types'
import { DOC_CATEGORIES } from '../types'
import { PrinterIcon, CopyIcon, QrIcon } from './icons'
import { CategoryIcon } from './CategoryIcon'
import { ICON_SRC, APP_NAME } from '../brand'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function QrModal({ doc, onClose }: { doc: DocItem | null; onClose: () => void }) {
  const { state } = useStore()
  const [qr, setQr] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const url = doc ? docShareUrl(state.settings.shareBaseUrl, doc.id) : ''

  useEffect(() => {
    if (!doc) return
    setQr('')
    setCopied(false)
    makeQrDataUrl(url, 480).then(setQr).catch(() => setQr(''))
  }, [doc, url])

  if (!doc) return null
  const cat = DOC_CATEGORIES.find((c) => c.id === doc.category)

  /** A6サイズ想定の印刷用レイアウトを隠しiframeで開いて印刷する */
  function handlePrint() {
    if (!qr) return
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc!.title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{margin:12mm}
  body{font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP',system-ui,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .card{max-width:460px;margin:0 auto;padding:28px 24px;text-align:center;border:2px solid #e2e8f0;border-radius:28px}
  .brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px}
  .brand img{width:30px;height:30px;border-radius:8px}
  .brand span{font-weight:800;font-size:18px;color:#0f172a}
  .cat{display:inline-block;padding:5px 14px;border-radius:999px;font-weight:700;font-size:14px;color:${cat?.color};background:${cat?.color}22}
  h1{font-size:24px;line-height:1.4;margin:14px 8px 18px}
  .qr{width:300px;height:300px;border:8px solid #fff;border-radius:16px}
  .qrwrap{display:inline-block;padding:12px;border:1px solid #e2e8f0;border-radius:20px}
  .hint{color:#475569;font-size:15px;line-height:1.6;margin-top:18px}
  .url{margin-top:10px;font-size:11px;color:#94a3b8;word-break:break-all}
</style></head>
<body>
  <div class="card">
    <div class="brand"><img src="${ICON_SRC}" alt=""><span>${APP_NAME}</span></div>
    <div class="cat">${escapeHtml(cat?.label ?? '')}</div>
    <h1>${escapeHtml(doc!.title)}</h1>
    <div class="qrwrap"><img class="qr" src="${qr}" alt="QR"></div>
    <p class="hint">スマホのカメラでこのQRコードを読み取ると<br>最新の情報がすぐに見られます</p>
    <p class="url">${escapeHtml(url)}</p>
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
    // 印刷ダイアログが閉じたあと（推定）にiframeを片付ける
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
    <Modal open={!!doc} onClose={onClose} title="冷蔵庫に貼るQRコード">
      <div className="flex flex-col items-center">
        <p className="mb-3 text-center text-sm text-slate-500">
          このQRを<strong>1枚だけ</strong>冷蔵庫に貼れば、家族はスマホで読み取るだけで
          <br />
          「{doc.title}」の最新版にアクセスできます。
        </p>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          {qr ? (
            <img src={qr} alt="QRコード" width={240} height={240} className="h-60 w-60" />
          ) : (
            <div className="flex h-60 w-60 items-center justify-center text-slate-300">
              <Spinner className="text-brand-500" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: cat?.color }}>
          <CategoryIcon cat={doc.category} size={16} />
          <span className="text-slate-700">{doc.title}</span>
        </div>
        <code className="mt-2 break-all rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-400">{url}</code>

        {/* 印刷を主役に */}
        <Button className="mt-4 w-full" onClick={handlePrint} disabled={!qr}>
          <PrinterIcon width={18} height={18} /> 印刷する（冷蔵庫に貼る）
        </Button>

        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <Button variant="soft" onClick={copyLink}>
            <CopyIcon width={18} height={18} /> {copied ? 'コピーしました' : 'リンクをコピー'}
          </Button>
          <a
            href={qr || '#'}
            download={`smartpita-qr-${doc.id}.png`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 active:bg-brand-100"
          >
            <QrIcon width={18} height={18} /> 画像を保存
          </a>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          ※ 印刷して冷蔵庫に貼ると、家族がいつでも最新情報にアクセスできます。
        </p>
      </div>
    </Modal>
  )
}
