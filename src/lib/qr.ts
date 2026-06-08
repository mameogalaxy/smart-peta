import QRCode from 'qrcode'

/** 文字列から QR コードの dataURL(PNG) を生成 */
export async function makeQrDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

/**
 * 書類への共有URLを組み立てる。
 * 家族はこのURL(=QR)を読み取ると、最新の書類ページに飛べる。
 * 実データは端末ローカルのため、ここでは「最新版へ常に飛ぶ固定リンク」を表現する。
 */
export function docShareUrl(baseUrl: string, docId: string): string {
  const base = (baseUrl || window.location.origin).replace(/\/$/, '')
  return `${base}/d/${docId}`
}
