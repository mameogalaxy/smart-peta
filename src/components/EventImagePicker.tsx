import { useRef, useState } from 'react'
import { Button } from './ui'
import { CameraIcon, DownloadIcon, PlusIcon, TrashIcon } from './icons'
import { ImageLightbox } from './ImageLightbox'
import { renderPdfPages } from '../lib/pdf'
import { downscaleImage, fileToDataUrl, saveImagesToDevice } from '../lib/util'

export function EventImagePicker({ images, onChange }: { images: string[]; onChange: (images: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function addFiles(files: FileList) {
    setLoading(true)
    try {
      const added: string[] = []
      for (const file of Array.from(files)) {
        if (file.type === 'application/pdf') {
          const rendered = await renderPdfPages(file)
          added.push(...rendered.pages)
        } else {
          const raw = await fileToDataUrl(file)
          added.push(await downscaleImage(raw, 1400, 0.82).catch(() => raw))
        }
      }
      if (added.length) onChange([...images, ...added])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">画像・PDF（任意）</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 disabled:opacity-60"
        >
          <PlusIcon width={15} height={15} /> {loading ? '追加中…' : '追加'}
        </button>
      </div>

      {images.length ? (
        <>
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
            {images.map((image, index) => (
              <div key={index} className="relative w-[82%] shrink-0 snap-center">
                <button type="button" onClick={() => setLightbox(image)} className="block w-full">
                  <img src={image} alt={`予定の添付 ${index + 1}`} className="h-48 w-full rounded-lg bg-white object-contain" />
                </button>
                <span className="absolute left-2 top-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px] font-bold text-white">
                  {index + 1}/{images.length}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))}
                  aria-label={`${index + 1}枚目を削除`}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-slate-900/60 text-white active:bg-red-500"
                >
                  <TrashIcon width={16} height={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="flex w-[55%] shrink-0 snap-center flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand-200 bg-brand-50 py-8 text-brand-600"
            >
              <CameraIcon width={24} height={24} />
              <span className="text-sm font-bold">追加する</span>
            </button>
          </div>
          <Button
            variant="soft"
            className="mt-2 w-full"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await saveImagesToDevice(images, 'smartpita-event')
              } finally {
                setSaving(false)
              }
            }}
          >
            <DownloadIcon width={18} height={18} /> {saving ? '保存中…' : images.length > 1 ? `${images.length}枚を保存` : '画像を保存'}
          </Button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-5 text-sm font-semibold text-slate-400 active:bg-slate-50"
        >
          <CameraIcon width={20} height={20} /> {loading ? '画像・PDFを追加中…' : '写真を撮る・画像/PDFを選ぶ'}
        </button>
      )}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
