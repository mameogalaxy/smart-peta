/** 任意のHTMLを隠しiframeで印刷する（PWAでも動作） */
export function printHtml(html: string) {
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

export function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
