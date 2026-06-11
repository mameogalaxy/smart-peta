/** 短いユニークID */
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  )
}

/** ファイル -> dataURL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** dataURL が PDF かどうか */
export function isPdfDataUrl(s: string): boolean {
  return s.startsWith('data:application/pdf')
}

/**
 * スキャン用にファイルを dataURL 化する。
 * 画像は縮小（コスト/保存量の削減）、PDF等はそのまま渡す（Geminiが直接読める）。
 */
export async function fileToScanData(file: File): Promise<string> {
  const raw = await fileToDataUrl(file)
  if (file.type === 'application/pdf' || raw.startsWith('data:application/pdf')) return raw
  return downscaleImage(raw).catch(() => raw)
}

/** dataURL を File に変換（保存・共有用）。PDFや不正値は null。 */
export function dataUrlToFile(dataUrl: string, name: string): File | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!m) return null
  const bin = atob(m[2])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type: m[1] })
}

/** dataURL の拡張子（png/jpg等）を返す */
function extFromDataUrl(dataUrl: string): string {
  const m = /^data:image\/([\w.+-]+)/.exec(dataUrl)
  const t = (m?.[1] || 'jpeg').toLowerCase()
  return t === 'jpeg' ? 'jpg' : t
}

/**
 * 画像を端末に保存する。
 * - 可能ならOSの共有シート（iOS/Androidの「画像を保存」でフォト/ギャラリーへ）を使う。
 * - 非対応ならファイルとしてダウンロード。
 * 返り値: 共有/保存を試みたら true。
 */
export async function saveImagesToDevice(images: string[], prefix = 'smartpita'): Promise<boolean> {
  const list = images.filter((s) => s && !s.startsWith('data:application/pdf'))
  const files: File[] = []
  list.forEach((src, i) => {
    const name = list.length > 1 ? `${prefix}-${i + 1}.${extFromDataUrl(src)}` : `${prefix}.${extFromDataUrl(src)}`
    const f = dataUrlToFile(src, name)
    if (f) files.push(f)
  })
  if (!files.length) return false
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  if (typeof nav.canShare === 'function' && nav.canShare({ files }) && navigator.share) {
    try {
      await navigator.share({ files })
      return true
    } catch {
      // キャンセル/失敗 → ダウンロードにフォールバック
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  return true
}

/** dataURL から base64 部分と mime を取り出す */
export function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!match) return { mime: 'image/jpeg', base64: '' }
  return { mime: match[1], base64: match[2] }
}

/** 画像を最大辺 maxSize に縮小して JPEG dataURL にする（APIコスト/保存量の削減） */
export async function downscaleImage(dataUrl: string, maxSize = 1280, quality = 0.8): Promise<string> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/** 家族共有用に強めに圧縮（Firestore 1MB制限内に収めるため）。PDFはそのまま。 */
export async function compressForShare(dataUrl: string, maxSize = 1000, quality = 0.5): Promise<string> {
  if (dataUrl.startsWith('data:application/pdf')) return dataUrl
  return downscaleImage(dataUrl, maxSize, quality).catch(() => dataUrl)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 今日(ローカル)の YYYY-MM-DD */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

/** YYYY-MM-DD -> "6月10日(火)" など */
export function formatJpDate(iso: string): string {
  const d = parseISO(iso)
  if (!d) return iso
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`
}

export function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** 残り日数 ("今日" / "明日" / "あと3日" / "3日前") */
export function relativeDays(iso: string, base = new Date()): string {
  const d = parseISO(iso)
  if (!d) return ''
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const diff = Math.round((d.getTime() - b.getTime()) / 86400000)
  if (diff === 0) return '今日'
  if (diff === 1) return '明日'
  if (diff === 2) return '明後日'
  if (diff > 0) return `あと${diff}日`
  return `${-diff}日前`
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

export function addMonthsISO(iso: string, months: number): string {
  const d = parseISO(iso) ?? new Date()
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  // 月末調整（例: 1/31 + 1ヶ月 → 2/28）
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return todayISO(d)
}
