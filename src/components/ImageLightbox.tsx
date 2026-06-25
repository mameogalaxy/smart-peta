import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CloseIcon, DownloadIcon } from './icons'
import { saveImagesToDevice } from '../lib/util'

type Point = { x: number; y: number }
type Transform = { scale: number; x: number; y: number }

const MIN_SCALE = 1
const MAX_SCALE = 5

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

/** 書類画像を全画面表示し、ピンチ・ドラッグ・ダブルタップで拡大。複数枚は横スワイプ/矢印で切替。 */
export function ImageLightbox({
  src,
  images,
  index = 0,
  onClose,
}: {
  src?: string | null
  images?: string[] | null
  index?: number
  onClose: () => void
}) {
  const list = images && images.length ? images : src ? [src] : []
  const [current, setCurrent] = useState(index)
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<{
    distance: number
    scale: number
    midpoint: Point
    x: number
    y: number
  } | null>(null)
  const pan = useRef<{ pointerId: number; point: Point; x: number; y: number } | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const lastTap = useRef(0)
  const [saving, setSaving] = useState(false)

  // 開き直し（src/images/index 変更）で先頭ページへ
  useEffect(() => {
    setCurrent(index)
  }, [index, src, images])

  const count = list.length
  const srcCur = list[Math.min(current, count - 1)] ?? null

  // ページ切替・開き直しで拡大状態をリセット
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 })
    pointers.current.clear()
    gesture.current = null
    pan.current = null
    swipeStart.current = null
    lastTap.current = 0
    setSaving(false)
  }, [srcCur])

  if (!srcCur) return null

  function reset() {
    setTransform({ scale: 1, x: 0, y: 0 })
  }

  function go(delta: number) {
    setCurrent((c) => Math.min(count - 1, Math.max(0, c + delta)))
  }

  function beginGesture() {
    const points = [...pointers.current.values()]
    if (points.length < 2) return
    gesture.current = {
      distance: Math.max(1, distance(points[0], points[1])),
      scale: transform.scale,
      midpoint: midpoint(points[0], points[1]),
      x: transform.x,
      y: transform.y,
    }
    pan.current = null
    swipeStart.current = null
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      beginGesture()
    } else if (pointers.current.size === 1 && transform.scale > 1) {
      pan.current = { pointerId: e.pointerId, point: { x: e.clientX, y: e.clientY }, x: transform.x, y: transform.y }
    } else if (pointers.current.size === 1) {
      // 等倍時は横スワイプでページ切替できるよう開始位置を記録
      swipeStart.current = { x: e.clientX, y: e.clientY }
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const points = [...pointers.current.values()]

    if (points.length >= 2 && gesture.current) {
      const currentMidpoint = midpoint(points[0], points[1])
      const nextScale = clampScale(gesture.current.scale * (distance(points[0], points[1]) / gesture.current.distance))
      const ratio = nextScale / gesture.current.scale
      setTransform({
        scale: nextScale,
        x: currentMidpoint.x - gesture.current.midpoint.x + gesture.current.x * ratio,
        y: currentMidpoint.y - gesture.current.midpoint.y + gesture.current.y * ratio,
      })
      return
    }

    if (pan.current?.pointerId === e.pointerId && transform.scale > 1) {
      setTransform({
        scale: transform.scale,
        x: pan.current.x + e.clientX - pan.current.point.x,
        y: pan.current.y + e.clientY - pan.current.point.y,
      })
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    // 等倍時の横スワイプ → ページ切替
    if (swipeStart.current && transform.scale <= 1.02 && count > 1) {
      const dx = e.clientX - swipeStart.current.x
      const dy = e.clientY - swipeStart.current.y
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        go(dx < 0 ? 1 : -1)
      }
    }
    swipeStart.current = null
    pointers.current.delete(e.pointerId)
    gesture.current = null
    pan.current = null
    if (pointers.current.size === 1 && transform.scale > 1) {
      const [pointerId, point] = [...pointers.current.entries()][0]
      pan.current = { pointerId, point, x: transform.x, y: transform.y }
    }
    if (transform.scale <= 1.02) reset()
  }

  function onDoubleTap() {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      setTransform((cur) => (cur.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between p-3">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await saveImagesToDevice([srcCur], 'smartpita-image')
            } finally {
              setSaving(false)
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <DownloadIcon width={18} height={18} /> {saving ? '保存中…' : '画像を保存'}
        </button>
        {count > 1 && <span className="text-sm font-bold text-white/90">{current + 1} / {count}</span>}
        <button onClick={onClose} className="rounded-full bg-white/15 p-2 text-white" aria-label="閉じる">
          <CloseIcon width={22} height={22} />
        </button>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={onDoubleTap}
      >
        <img
          src={srcCur}
          alt=""
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
            transformOrigin: 'center',
            transition: pointers.current.size ? 'none' : 'transform 120ms ease-out',
          }}
        />
        {count > 1 && transform.scale <= 1.02 && current > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white active:bg-white/25"
            aria-label="前の画像"
          >
            ‹
          </button>
        )}
        {count > 1 && transform.scale <= 1.02 && current < count - 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(1) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white active:bg-white/25"
            aria-label="次の画像"
          >
            ›
          </button>
        )}
        {transform.scale > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              reset()
            }}
            className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm"
          >
            100%
          </button>
        )}
      </div>
    </div>
  )
}
