import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Modal, Button, inputClass } from './ui'
import { Avatar } from './Avatar'
import { CameraIcon } from './icons'
import { MEMBER_COLORS } from '../types'
import { downscaleImage, fileToDataUrl, uid } from '../lib/util'

/** 初回起動時に「自分が家族の誰か（名前）」を必須登録させるゲート */
export function OnboardingGate() {
  const { state, updateSettings } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[0])
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  if (state.settings.memberName) return null

  async function onPhoto(file: File) {
    const raw = await fileToDataUrl(file)
    const small = await downscaleImage(raw, 256, 0.85).catch(() => raw)
    setPhoto(small)
  }

  function start() {
    const n = name.trim()
    if (!n) return
    updateSettings({
      memberName: n,
      memberColor: color,
      memberPhoto: photo,
      memberId: state.settings.memberId || uid(),
    })
  }

  /** 既に世帯に登録済みのメンバーを「自分」として選ぶ（別端末・再インストール時の本人認識） */
  function pickExisting(m: { id: string; name: string; color: string; photo?: string }) {
    updateSettings({ memberName: m.name, memberColor: m.color, memberPhoto: m.photo, memberId: m.id })
  }

  // 世帯に参加していて、既存メンバーがいる場合は「自分を選ぶ」導線を出す
  const existingMembers = state.family

  return (
    <Modal open onClose={() => {}} title="はじめまして">
      <div className="space-y-3">
        {existingMembers.length > 0 && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
            <p className="mb-2 text-sm font-bold text-brand-700">あなたはどの人ですか？</p>
            <div className="flex flex-wrap gap-2">
              {existingMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickExisting(m)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
                >
                  <Avatar member={m} size={20} /> {m.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              この端末を使うあなたを選ぶと、その人として認識されます。当てはまる人がいなければ下で新規登録してください。
            </p>
          </div>
        )}

        <p className="text-sm text-slate-600">
          {existingMembers.length > 0 ? '新しく登録する場合：' : ''}
          あなたのプロフィールを登録してください。家族の予定・買い物・担当で「誰が」を表示します。
        </p>

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
          <button onClick={() => fileRef.current?.click()} className="relative active:opacity-80" aria-label="写真を選ぶ">
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
              onKeyDown={(e) => e.key === 'Enter' && start()}
              placeholder="名前（例: ママ / たろう）"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">アイコンをタップで写真を設定（任意）</p>
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

        <Button className="w-full" disabled={!name.trim()} onClick={start}>
          はじめる
        </Button>
        <p className="text-[11px] text-slate-400">あとで設定からいつでも変更できます。</p>
      </div>
    </Modal>
  )
}
