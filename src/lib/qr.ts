import QRCode from 'qrcode'
import { APP_NAME, ICON_SRC } from '../brand'

/** 文字列から QR コードの dataURL(PNG) を生成 */
export async function makeQrDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const JP_FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP",system-ui,sans-serif'

export interface BrandedQrOptions {
  title?: string
  titleColor?: string
}

/**
 * スマートピタのロゴ・名前入りの「ブランドQRカード」を生成する。
 * - QR中央にロゴを配置（誤り訂正レベルHで読み取り可能）
 * - 上部にロゴ＋「スマートピタ」、下部にタイトル
 * 返り値は印刷・保存・表示に使える PNG dataURL。
 */
export async function makeBrandedQrDataUrl(url: string, opts: BrandedQrOptions = {}): Promise<string> {
  const Q = 560
  const qc = document.createElement('canvas')
  await QRCode.toCanvas(qc, url, {
    width: Q,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  const qctx = qc.getContext('2d')
  const logo = await loadImage(ICON_SRC)
  if (qctx) {
    const ls = Math.round(Q * 0.22)
    const lx = (Q - ls) / 2
    const ly = (Q - ls) / 2
    qctx.fillStyle = '#ffffff'
    roundRect(qctx, lx - 14, ly - 14, ls + 28, ls + 28, 18)
    qctx.fill()
    qctx.drawImage(logo, lx, ly, ls, ls)
  }

  const pad = 56
  const headerH = 96
  const titleH = opts.title ? 80 : 16
  const W = Q + pad * 2
  const H = pad + headerH + Q + titleH + pad
  const card = document.createElement('canvas')
  card.width = W
  card.height = H
  const c = card.getContext('2d')
  if (!c) return qc.toDataURL('image/png')

  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, W, H)

  // ヘッダー：ロゴ＋名前を中央寄せ
  const hl = 72
  c.font = `700 56px ${JP_FONT}`
  c.textBaseline = 'middle'
  const tw = c.measureText(APP_NAME).width
  const groupW = hl + 18 + tw
  const gx = (W - groupW) / 2
  const hy = pad + headerH / 2
  c.drawImage(logo, gx, hy - hl / 2, hl, hl)
  c.fillStyle = '#0f172a'
  c.textAlign = 'left'
  c.fillText(APP_NAME, gx + hl + 18, hy + 2)

  // QR
  c.drawImage(qc, pad, pad + headerH, Q, Q)

  // タイトル
  if (opts.title) {
    c.fillStyle = opts.titleColor || '#334155'
    c.font = `600 38px ${JP_FONT}`
    c.textAlign = 'center'
    c.textBaseline = 'alphabetic'
    let t = opts.title
    while (c.measureText(t).width > W - pad * 2 && t.length > 6) t = t.slice(0, -1)
    if (t !== opts.title) t = t.slice(0, -1) + '…'
    c.fillText(t, W / 2, pad + headerH + Q + 52)
  }

  return card.toDataURL('image/png')
}

/**
 * 書類への共有URLを組み立てる。
 * 家族はこのURL(=QR)を読み取ると、最新の書類ページに飛べる。
 * 実データは端末ローカルのため、ここでは「最新版へ常に飛ぶ固定リンク」を表現する。
 */
export function docShareUrl(baseUrl: string, docId: string): string {
  // HashRouter 採用のため #/d/:id 形式。静的ホストでもそのまま開ける。
  const fallback = window.location.origin + window.location.pathname
  const base = (baseUrl || fallback).replace(/\/?(#.*)?$/, '')
  return `${base}/#/d/${docId}`
}
