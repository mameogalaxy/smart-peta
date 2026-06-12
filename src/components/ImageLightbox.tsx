import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CloseIcon } from './icons'

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

/** 書類画像を全画面表示し、ピンチ・ドラッグ・ダブルタップで拡大する。 */
export function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
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
  const lastTap = useRef(0)

  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 })
    pointers.current.clear()
    gesture.current = null
    pan.current = null
    lastTap.current = 0
  }, [src])

  if (!src) return null

  function reset() {
    setTransform({ scale: 1, x: 0, y: 0 })
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
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      beginGesture()
    } else if (pointers.current.size === 1 && transform.scale > 1) {
      pan.current = { pointerId: e.pointerId, point: { x: e.clientX, y: e.clientY }, x: transform.x, y: transform.y }
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
      setTransform((current) => (current.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex justify-end p-3">
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
          src={src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
            transformOrigin: 'center',
            transition: pointers.current.size ? 'none' : 'transform 120ms ease-out',
          }}
        />
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
