import { useState } from 'react'
import { useStore } from '../lib/store'
import { Modal, Button, inputClass } from './ui'
import { MEMBER_COLORS } from '../types'
import { uid } from '../lib/util'
import { ICON_SRC } from '../brand'

/** 初回起動時に「自分が家族の誰か（名前）」を必須登録させるゲート */
export function OnboardingGate() {
  const { state, updateSettings } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[0])

  if (state.settings.memberName) return null

  function start() {
    const n = name.trim()
    if (!n) return
    updateSettings({ memberName: n, memberColor: color, memberId: state.settings.memberId || uid() })
  }

  return (
    <Modal open onClose={() => {}} title="はじめまして">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <img src={ICON_SRC} alt="" className="h-9 w-9" />
          <p className="text-sm text-slate-600">
            あなたの名前を登録してください。家族の予定・買い物・担当で「誰が」を表示するのに使います。
          </p>
        </div>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder="例: ママ / たろう"
          autoFocus
        />
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-600">色（アバター）</span>
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
