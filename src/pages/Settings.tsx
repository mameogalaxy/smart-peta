import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Button, Field, inputClass } from '../components/ui'
import { PlusIcon, TrashIcon } from '../components/icons'
import { uid } from '../lib/util'

const EMOJIS = ['👨', '👩', '🧒', '👦', '👧', '👶', '👴', '👵', '🐶', '🐱']

export function Settings() {
  const { state, updateSettings, setFamily, resetAll } = useStore()
  const s = state.settings
  const [showKey, setShowKey] = useState(false)
  const [newName, setNewName] = useState('')

  return (
    <div className="space-y-5">
      {/* AI設定 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">AI（Gemini）連携</h2>
        <Card className="space-y-3 p-4">
          <Field
            label="Gemini APIキー"
            hint="Google AI Studio の無料枠で取得できます。キーは端末内のみに保存され、外部送信されません。"
          >
            <div className="flex gap-2">
              <input
                className={inputClass}
                type={showKey ? 'text' : 'password'}
                value={s.geminiApiKey}
                onChange={(e) => updateSettings({ geminiApiKey: e.target.value.trim() })}
                placeholder="AIza..."
                autoComplete="off"
              />
              <Button variant="ghost" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隠す' : '表示'}
              </Button>
            </div>
          </Field>
          <Field label="モデル" hint="2026年の無料枠で利用可能なモデルを指定します。">
            <select
              className={inputClass}
              value={s.geminiModel}
              onChange={(e) => updateSettings({ geminiModel: e.target.value })}
            >
              <option value="gemini-2.5-flash">gemini-2.5-flash（推奨・高速/無料枠）</option>
              <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite（軽量）</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro（高精度）</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            </select>
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {s.geminiApiKey ? '✅ キー設定済み。実際の写真をAIが解析します。' : '⚠️ 未設定。デモ解析で動作します（サンプル結果）。'}
          </div>
        </Card>
      </section>

      {/* 共有 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">共有 / QR</h2>
        <Card className="space-y-3 p-4">
          <Field label="世帯名">
            <input className={inputClass} value={s.householdName} onChange={(e) => updateSettings({ householdName: e.target.value })} />
          </Field>
          <Field label="共有URLのベース" hint="QRコードが指すURLの先頭。アプリを公開した場所のURLを入れると、家族がそのまま開けます。">
            <input
              className={inputClass}
              value={s.shareBaseUrl}
              onChange={(e) => updateSettings({ shareBaseUrl: e.target.value.trim() })}
              placeholder={window.location.origin}
            />
          </Field>
        </Card>
      </section>

      {/* 家族 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">家族メンバー</h2>
        <Card className="space-y-2 p-4">
          {state.family.map((f, idx) => (
            <div key={f.id} className="flex items-center gap-2">
              <select
                value={f.emoji}
                onChange={(e) => setFamily(state.family.map((x) => (x.id === f.id ? { ...x, emoji: e.target.value } : x)))}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-lg"
              >
                {EMOJIS.map((em) => (
                  <option key={em} value={em}>
                    {em}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                value={f.name}
                onChange={(e) => setFamily(state.family.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))}
              />
              <button
                onClick={() => setFamily(state.family.filter((x) => x.id !== f.id))}
                disabled={state.family.length <= 1}
                className="p-2 text-slate-300 disabled:opacity-30 active:text-red-500"
                aria-label={`${f.name}を削除`}
              >
                <TrashIcon width={18} height={18} />
              </button>
              {idx === -1 && null}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  setFamily([...state.family, { id: uid(), name: newName.trim(), emoji: '🙂' }])
                  setNewName('')
                }
              }}
              placeholder="メンバーを追加"
            />
            <Button
              variant="soft"
              disabled={!newName.trim()}
              onClick={() => {
                setFamily([...state.family, { id: uid(), name: newName.trim(), emoji: '🙂' }])
                setNewName('')
              }}
            >
              <PlusIcon width={18} height={18} />
            </Button>
          </div>
        </Card>
      </section>

      {/* データ */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">データ</h2>
        <Card className="p-4">
          <p className="mb-3 text-sm text-slate-500">
            書類{state.docs.length}件・予定{state.events.length}件・レシピ{state.recipes.length}件を
            この端末に保存しています。
          </p>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (confirm('すべてのデータを削除して初期化しますか？この操作は元に戻せません。')) resetAll()
            }}
          >
            <TrashIcon width={18} height={18} /> すべてのデータを初期化
          </Button>
        </Card>
      </section>

      <p className="pb-4 text-center text-xs text-slate-300">スマートペタ v0.1 — 冷蔵庫の紙をゼロに</p>
    </div>
  )
}
