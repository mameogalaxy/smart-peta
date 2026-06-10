import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Modal, Button, inputClass } from './ui'
import { Avatar } from './Avatar'
import { CameraIcon } from './icons'
import { MEMBER_COLORS } from '../types'
import { downscaleImage, fileToDataUrl, uid } from '../lib/util'

/** プロフィール（自分の名前・色・写真）を編集するモーダル。ホーム/設定から共通利用。 */
export function ProfileEditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, updateSettings } = useStore()
  const s = state.settings
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(s.memberName ?? '')
  const [color, setColor] = useState(s.memberColor ?? MEMBER_COLORS[0])
  const [photo, setPhoto] = useState<string | undefined>(s.memberPhoto)

  // モーダルを開くたびに現在値で初期化
  useEffect(() => {
    if (open) {
      setName(s.memberName ?? '')
      setColor(s.memberColor ?? MEMBER_COLORS[0])
      setPhoto(s.memberPhoto)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onPhoto(file: File) {
    const raw = await fileToDataUrl(file)
    const small = await downscaleImage(raw, 256, 0.85).catch(() => raw)
    setPhoto(small)
  }

  function save() {
    const n = name.trim()
    if (!n) return
    updateSettings({ memberName: n, memberColor: color, memberPhoto: photo, memberId: s.memberId || uid() })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="プロフィール">
      <div className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPhoto(f)
            e.target.value = ''
          }}
        />
        <div className="flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="relative active:opacity-80" aria-label="写真を変更">
            <Avatar member={{ name: name || '？', color, photo }} size={64} />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white ring-2 ring-white">
              <CameraIcon width={13} height={13} />
            </span>
          </button>
          <div className="flex-1">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="名前"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">アイコンをタップで写真を設定</p>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-600">色（写真なしの時）</span>
          <div className="flex flex-wrap gap-2">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition ${color === c ? 'ring-2 ring-slate-700 ring-offset-2' : ''}`}
                style={{ backgroundColor: c }}
                aria-label="色を選ぶ"
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {photo && (
            <Button variant="ghost" onClick={() => setPhoto(undefined)}>
              写真を外す
            </Button>
          )}
          <Button className="flex-1" disabled={!name.trim()} onClick={save}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}
