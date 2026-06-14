const PDF_MAX_PAGES = 20

// PDF.js は重いので単一ファイルへ同梱せず、必要になった時だけCDNから読み込む（初回表示を軽く保つ）。
const PDFJS_VERSION = '6.0.227'
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ `${PDFJS_BASE}/build/pdf.min.mjs`).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/build/pdf.worker.min.mjs`
      return pdfjs
    })
  }
  return pdfjsPromise
}

/** PDFを表示・保存用のJPEG画像へ変換する（PDF.jsはCDNから遅延読み込み）。 */
export async function renderPdfPages(
  file: File,
  maxPages = PDF_MAX_PAGES,
): Promise<{ pages: string[]; totalPages: number }> {
  const pdfjs = await loadPdfjs()

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  const pages: string[] = []
  const count = Math.min(pdf.numPages, maxPages)

  try {
    for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 1400 / Math.max(baseViewport.width, baseViewport.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)

      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      pages.push(canvas.toDataURL('image/jpeg', 0.78))
      page.cleanup()
    }
    return { pages, totalPages: pdf.numPages }
  } finally {
    await task.destroy()
  }
}
