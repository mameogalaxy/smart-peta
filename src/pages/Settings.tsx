import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { getUsage, resetUsage } from '../lib/usage'
import { Card, Button, Field, inputClass } from '../components/ui'
import { PlusIcon, TrashIcon, QrIcon } from '../components/icons'
import { Avatar } from '../components/Avatar'
import { QrModal } from '../components/QrModal'
import { MEMBER_COLORS } from '../types'
import { useConfirm } from '../lib/confirm'
import { encodeInvite } from '../lib/firebase'
import { HAS_DEFAULT_FIREBASE } from '../firebaseConfig'
import { uid } from '../lib/util'

function nextColor(used: string[]): string {
  return MEMBER_COLORS.find((c) => !used.includes(c)) ?? MEMBER_COLORS[used.length % MEMBER_COLORS.length]
}

function yen(n: number): string {
  if (n <= 0) return '¥0'
  if (n < 10) return '¥' + n.toFixed(2)
  return '¥' + Math.round(n).toLocaleString()
}

export function Settings() {
  const { state, updateSettings, setFamily, resetAll, cloud, createHousehold, joinHousehold, leaveHousehold } = useStore()
  const confirm = useConfirm()
  const s = state.settings
  const [showKey, setShowKey] = useState(false)
  const [showKey2, setShowKey2] = useState(false)
  const [hhName, setHhName] = useState('わが家')
  const [joinCode, setJoinCode] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudMsg, setCloudMsg] = useState('')
  const [inviteQr, setInviteQr] = useState<{ title: string; url: string; hint: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [appQr, setAppQr] = useState<{ title: string; url: string; hint: string } | null>(null)
  const [usageTick, setUsageTick] = useState(0)
  const usage = useMemo(() => getUsage(), [usageTick])

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
          {s.geminiApiKey && (
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: 'APIキーを削除', message: '保存しているGemini APIキーを削除しますか？', confirmLabel: '削除', danger: true })) {
                  updateSettings({ geminiApiKey: '' })
                }
              }}
            >
              <TrashIcon width={16} height={16} /> APIキーを削除
            </Button>
          )}

          <Field
            label="2つ目のAPIキー（予備・任意）"
            hint="無料枠が混雑(503)・タイムアウトした時に自動でこちらへ切り替えます。有料や別アカウントのキーを入れると安定します。"
          >
            <div className="flex gap-2">
              <input
                className={inputClass}
                type={showKey2 ? 'text' : 'password'}
                value={s.geminiApiKey2 ?? ''}
                onChange={(e) => updateSettings({ geminiApiKey2: e.target.value.trim() })}
                placeholder="AIza...（任意）"
                autoComplete="off"
              />
              <Button variant="ghost" onClick={() => setShowKey2((v) => !v)}>
                {showKey2 ? '隠す' : '表示'}
              </Button>
            </div>
          </Field>
          {s.geminiApiKey2 && (
            <button
              onClick={() => updateSettings({ geminiApiKey2: '' })}
              className="text-xs font-semibold text-slate-400"
            >
              2つ目のキーを削除
            </button>
          )}

          <Field label="モデル（メイン）" hint="書類のOCRなど精度重視の処理に使用。既定の gemini-flash-latest は常に最新の無料Flash。">
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
          <Field label="軽量モデル（コスパ用）" hint="冷蔵庫判定・献立提案・テキスト整理など出力が少ない処理に使用。安価/高速なモデルを指定するとコスパ最適化。">
            <input
              className={inputClass}
              value={s.geminiModelLight ?? ''}
              onChange={(e) => updateSettings({ geminiModelLight: e.target.value.trim() })}
              placeholder="gemini-flash-lite-latest"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.geminiApiKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {s.geminiApiKey ? 'キー設定済み。実際の写真をAIが解析します。' : '未設定。デモ解析で動作します（サンプル結果）。'}
          </div>

          {/* AI利用状況 */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-1 text-xs font-bold text-slate-500">AI利用状況（この端末）</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] text-slate-400">今日</p>
                <p className="font-bold text-slate-800">{yen(usage.dayPrompt / 1e6 * s.yenInPerM + usage.dayOutput / 1e6 * s.yenOutPerM)}</p>
                <p className="text-[11px] text-slate-400">{usage.dayReq}回・約{usage.dayTokens.toLocaleString()}トークン</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] text-slate-400">累計</p>
                <p className="font-bold text-slate-800">{yen(usage.totalPrompt / 1e6 * s.yenInPerM + usage.totalOutput / 1e6 * s.yenOutPerM)}</p>
                <p className="text-[11px] text-slate-400">{usage.totalReq}回・約{usage.totalTokens.toLocaleString()}トークン</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              ※「有料換算」の目安です。<strong>無料枠内なら実際の料金は¥0</strong>。正確な料金・上限はGoogle AI Studioの管理画面で確認できます。
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-500">
                入力単価(円/100万)
                <input
                  type="number"
                  className={inputClass + ' mt-0.5 py-1.5'}
                  value={s.yenInPerM}
                  onChange={(e) => updateSettings({ yenInPerM: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-500">
                出力単価(円/100万)
                <input
                  type="number"
                  className={inputClass + ' mt-0.5 py-1.5'}
                  value={s.yenOutPerM}
                  onChange={(e) => updateSettings({ yenOutPerM: Number(e.target.value) || 0 })}
                />
              </label>
            </div>
            {usage.totalReq > 0 && (
              <button
                onClick={() => {
                  resetUsage()
                  setUsageTick((n) => n + 1)
                }}
                className="mt-2 text-[11px] font-semibold text-slate-400"
              >
                カウントをリセット
              </button>
            )}
          </div>
        </Card>
      </section>

      {/* 家族クラウド共有 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">家族でクラウド共有</h2>
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                cloud.status === 'on' ? 'bg-emerald-500' : cloud.status === 'connecting' ? 'bg-amber-500' : cloud.status === 'error' ? 'bg-red-500' : 'bg-slate-300'
              }`}
            />
            {cloud.status === 'on'
              ? `同期中（${s.householdName2 ?? '家族'}）`
              : cloud.status === 'connecting'
                ? '接続中…'
                : cloud.status === 'error'
                  ? `エラー: ${cloud.error}`
                  : '未接続（この端末のみ）'}
          </div>

          {HAS_DEFAULT_FIREBASE ? (
            <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold">上級者: 別のFirebaseを使う</summary>
              <div className="mt-2">
                <textarea
                  className={`${inputClass} min-h-24 font-mono text-xs`}
                  value={s.firebaseConfig ?? ''}
                  onChange={(e) => updateSettings({ firebaseConfig: e.target.value })}
                  placeholder="空欄なら共通の既定設定を使います"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <p className="mt-1 text-[11px] text-slate-400">空欄でOK。独自のFirebaseを使う場合のみ config を貼り付け。</p>
              </div>
            </details>
          ) : (
            <Field label="Firebase 設定 (config JSON)" hint="Firebaseコンソール→プロジェクト設定→マイアプリ の firebaseConfig を貼り付け。">
              <textarea
                className={`${inputClass} min-h-24 font-mono text-xs`}
                value={s.firebaseConfig ?? ''}
                onChange={(e) => updateSettings({ firebaseConfig: e.target.value })}
                placeholder='{"apiKey":"...","authDomain":"...","projectId":"...", ...}'
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          )}

          {!s.householdId ? (
            <div className="space-y-3">
              <div>
                <span className="mb-1 block text-sm font-semibold text-slate-600">新しく世帯を作る</span>
                <div className="flex gap-2">
                  <input className={inputClass} value={hhName} onChange={(e) => setHhName(e.target.value)} placeholder="世帯名（例: わが家）" />
                  <Button
                    disabled={cloudBusy}
                    onClick={async () => {
                      setCloudBusy(true)
                      setCloudMsg('')
                      try {
                        await createHousehold(hhName)
                        setCloudMsg('世帯を作成しました。招待QRを家族に見せて参加してもらえます。')
                      } catch (e) {
                        setCloudMsg(e instanceof Error ? e.message : '作成に失敗しました。')
                      } finally {
                        setCloudBusy(false)
                      }
                    }}
                  >
                    作成
                  </Button>
                </div>
              </div>
              <div>
                <span className="mb-1 block text-sm font-semibold text-slate-600">既存の世帯に参加</span>
                <div className="flex gap-2">
                  <input className={inputClass} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="参加コード" autoCapitalize="none" />
                  <Button
                    variant="soft"
                    disabled={cloudBusy || !joinCode.trim()}
                    onClick={async () => {
                      setCloudBusy(true)
                      setCloudMsg('')
                      try {
                        await joinHousehold(joinCode)
                        setCloudMsg('世帯に参加しました。家族の内容が同期されます。')
                      } catch (e) {
                        setCloudMsg(e instanceof Error ? e.message : '参加に失敗しました。')
                      } finally {
                        setCloudBusy(false)
                      }
                    }}
                  >
                    参加
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">参加すると、この端末の内容は家族の内容に置き換わります。</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-bold text-brand-700">参加中の世帯</p>
                <p className="font-semibold text-slate-800">{s.householdName2 ?? '家族'}</p>
                <code className="mt-1 block break-all text-[11px] text-slate-400">コード: {s.householdId}</code>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="soft"
                  onClick={() =>
                    setInviteQr({
                      title: `${s.householdName2 ?? '家族'} に招待`,
                      url: `${appUrl}?invite=${encodeInvite(s.firebaseConfig ?? '', s.householdId!)}`,
                      hint: 'スマホで読み取ると設定+参加が完了します',
                    })
                  }
                >
                  招待QRを表示
                </Button>
                <Button
                  variant="soft"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(s.householdId!)
                      setCloudMsg('参加コードをコピーしました。')
                    } catch {
                      /* noop */
                    }
                  }}
                >
                  コードをコピー
                </Button>
              </div>
              <Button
                variant="danger"
                className="w-full"
                onClick={async () => {
                  if (await confirm({ title: '世帯から退出', message: '退出するとこの端末は同期を停止します（家族側のデータは残ります）。', confirmLabel: '退出', danger: true })) {
                    leaveHousehold()
                    setCloudMsg('')
                  }
                }}
              >
                世帯から退出
              </Button>
            </div>
          )}

          {cloudMsg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{cloudMsg}</p>}
          <p className="text-[11px] text-slate-400">
            文字データ（書類の文・予定・リスト等）のみ同期し、<strong>写真は各端末ローカル</strong>に保存（無料枠を維持）。データは参加中の世帯メンバーだけが見られます（他の人には不可視）。
          </p>
        </Card>
      </section>

      <QrModal custom={inviteQr} onClose={() => setInviteQr(null)} />

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
        <Card className="space-y-3 p-4">
          <Button
            variant="soft"
            className="w-full"
            onClick={() => location.replace(location.origin + location.pathname + '?v=' + Date.now())}
          >
            アプリを最新の状態に更新
          </Button>
          <p className="text-sm text-slate-500">
            書類{state.docs.length}件・予定{state.events.length}件・レシピ{state.recipes.length}件を
            この端末に保存しています。データとAPIキーはこの端末内（ブラウザ）だけに保存され、外部やリポジトリには送られません。
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
