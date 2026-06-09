import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Card, Button, Field, inputClass } from '../components/ui'
import { PlusIcon, TrashIcon, QrIcon } from '../components/icons'
import { Avatar } from '../components/Avatar'
import { QrModal } from '../components/QrModal'
import { MEMBER_COLORS } from '../types'
import { useConfirm } from '../lib/confirm'
import { uid } from '../lib/util'

function nextColor(used: string[]): string {
  return MEMBER_COLORS.find((c) => !used.includes(c)) ?? MEMBER_COLORS[used.length % MEMBER_COLORS.length]
}

export function Settings() {
  const { state, updateSettings, setFamily, resetAll } = useStore()
  const confirm = useConfirm()
  const s = state.settings
  const [showKey, setShowKey] = useState(false)
  const [newName, setNewName] = useState('')
  const [appQr, setAppQr] = useState<{ title: string; url: string; hint: string } | null>(null)

  const appUrl = (s.shareBaseUrl || window.location.origin + window.location.pathname).replace(/[?#].*$/, '')

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
          <Field label="モデル" hint="既定の gemini-flash-latest は常に最新の無料Flashを指すため、バージョン廃止の影響を受けません。通常は変更不要です。">
            <input
              className={inputClass}
              value={s.geminiModel}
              onChange={(e) => updateSettings({ geminiModel: e.target.value.trim() })}
              placeholder="gemini-flash-latest"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.geminiApiKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {s.geminiApiKey ? 'キー設定済み。実際の写真をAIが解析します。' : '未設定。デモ解析で動作します（サンプル結果）。'}
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

          <Button
            className="w-full"
            onClick={() =>
              setAppQr({
                title: `${s.householdName}の掲示板`,
                url: appUrl,
                hint: 'スマホのカメラで読み取るとスマートピタが開きます',
              })
            }
          >
            <QrIcon width={18} height={18} /> アプリのQRコードを作成・印刷
          </Button>
          <p className="text-xs text-slate-400">
            家族みんなで使うためのQRです。印刷して冷蔵庫に貼れば、スマホで読み取ってすぐ開けます。
            <br />
            各書類ごとのQRは
            <Link to="/docs" className="font-semibold text-brand-600">［書類］</Link>
            の各カードの「QRを貼る」から発行・印刷できます。
          </p>

          <Field label="共有URLのベース（上級者向け・任意）" hint="空欄ならこのアプリのURLが自動で使われます。独自ドメイン等で配信する場合のみ指定してください。">
            <input
              className={inputClass}
              value={s.shareBaseUrl}
              onChange={(e) => updateSettings({ shareBaseUrl: e.target.value.trim() })}
              placeholder="空欄で自動設定"
            />
          </Field>
        </Card>
      </section>

      <QrModal custom={appQr} onClose={() => setAppQr(null)} />

      {/* 家族 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">家族メンバー</h2>
        <Card className="space-y-2 p-4">
          {state.family.map((f) => (
            <div key={f.id} className="space-y-2 rounded-xl border border-slate-100 p-2">
              <div className="flex items-center gap-2">
                <Avatar member={f} size={36} />
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
              </div>
              <div className="flex flex-wrap gap-1.5 pl-1">
                {MEMBER_COLORS.map((col) => (
                  <button
                    key={col}
                    onClick={() => setFamily(state.family.map((x) => (x.id === f.id ? { ...x, color: col } : x)))}
                    className={`h-6 w-6 rounded-full transition ${f.color === col ? 'ring-2 ring-slate-700 ring-offset-2' : ''}`}
                    style={{ backgroundColor: col }}
                    aria-label="色を選ぶ"
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  setFamily([...state.family, { id: uid(), name: newName.trim(), color: nextColor(state.family.map((x) => x.color)) }])
                  setNewName('')
                }
              }}
              placeholder="メンバーを追加"
            />
            <Button
              variant="soft"
              disabled={!newName.trim()}
              onClick={() => {
                setFamily([...state.family, { id: uid(), name: newName.trim(), color: nextColor(state.family.map((x) => x.color)) }])
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
            onClick={async () => {
              if (
                await confirm({
                  title: 'すべて初期化',
                  message: 'すべてのデータを削除して初期化しますか？この操作は元に戻せません。',
                  confirmLabel: '初期化する',
                  danger: true,
                })
              ) {
                resetAll()
              }
            }}
          >
            <TrashIcon width={18} height={18} /> すべてのデータを初期化
          </Button>
        </Card>
      </section>

      <p className="pb-4 text-center text-xs text-slate-300">スマートピタ v0.1 — 冷蔵庫の紙をゼロに</p>
    </div>
  )
}
