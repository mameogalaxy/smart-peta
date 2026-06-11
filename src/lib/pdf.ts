const PDF_MAX_PAGES = 20

/** PDFを表示・保存用のJPEG画像へ変換する。 */
export async function renderPdfPages(
  file: File,
  maxPages = PDF_MAX_PAGES,
): Promise<{ pages: string[]; totalPages: number }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

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
