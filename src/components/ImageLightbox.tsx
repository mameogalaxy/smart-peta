import { CloseIcon } from './icons'

/** タップで画像を全画面表示するライトボックス。別タブで開けばピンチ拡大も可能。 */
export function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex justify-between p-3">
        <a
          href={src}
          target="_blank"
          rel="noopener"
          className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white"
        >
          別タブで開く（ピンチ拡大）
        </a>
        <button onClick={onClose} className="rounded-full bg-white/15 p-2 text-white" aria-label="閉じる">
          <CloseIcon width={22} height={22} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2" onClick={onClose}>
        <img src={src} alt="" className="mx-auto w-full max-w-3xl object-contain" />
      </div>
    </div>
  )
}
