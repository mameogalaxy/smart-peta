import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Modal, Button, inputClass } from './ui'
import { Avatar } from './Avatar'
import { CameraIcon } from './icons'
import { MEMBER_COLORS } from '../types'
import { downscaleImage, fileToDataUrl, uid } from '../lib/util'

/** 初回起動時に「自分が家族の誰か（名前）」を必須登録させるゲート */
export function OnboardingGate() {
  const { state, cloud, updateSettings, joinHousehold, importData } = useStore()
  const restoreRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[0])
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinMsg, setJoinMsg] = useState('')
  /** 引き継ぎIDで指定された本人のメンバーID（同期到着後に自動でその人になる） */
  const [pendingMemberId, setPendingMemberId] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [nameErr, setNameErr] = useState('')

  // 引き継ぎIDの本人が同期で届いたら、自動でその人としてログイン
  useEffect(() => {
    if (!pendingMemberId || state.settings.memberName) return
    const m = state.family.find((f) => f.id === pendingMemberId)
    if (m) {
      updateSettings({ memberName: m.name, memberColor: m.color, memberPhoto: m.photo, memberId: m.id })
    }
  }, [pendingMemberId, state.family, state.settings.memberName, updateSettings])

  if (state.settings.memberName) return null

  async function onPhoto(file: File) {
    const raw = await fileToDataUrl(file)
    const small = await downscaleImage(raw, 256, 0.85).catch(() => raw)
    setPhoto(small)
  }

  /** 引き継ぎID（世帯コード または 世帯コード.メンバーID）でログイン */
  async function doJoin() {
    const code = joinCode.trim()
    if (!code) return
    const dot = code.indexOf('.')
    const hid = dot >= 0 ? code.slice(0, dot) : code
    const mid = dot >= 0 ? code.slice(dot + 1) : ''
    setJoinBusy(true)
    setJoinMsg('')
    try {
      await joinHousehold(hid)
      if (mid) {
        setPendingMemberId(mid)
        setJoinMsg('ログインしました。あなたのプロフィールを復元しています…')
      } else {
        setJoinMsg('接続しました。同期が終わると下に家族が表示されるので、自分を選んでください。')
      }
    } catch (e) {
      setJoinMsg(e instanceof Error ? e.message : 'ログインに失敗しました。IDをご確認ください。')
    } finally {
      setJoinBusy(false)
    }
  }

  /** バックアップファイル（JSON）からデータ・プロフィールごと復元 */
  async function onRestore(file: File) {
    const text = await file.text().catch(() => '')
    if (text && importData(text)) {
      setJoinMsg('バックアップから復元しました。')
    } else {
      setJoinMsg('復元に失敗しました（ファイル形式をご確認ください）。')
    }
  }

  function start() {
    const n = name.trim()
    if (!n) return
    // 同名メンバーがいる場合は新規作成せず、本人選択を促す（パパが2人になる事故防止）
    const dup = state.family.find((f) => f.name.trim() === n)
    if (dup) {
      setNameErr(`「${n}」はすでに家族にいます。上の「あなたはどの人ですか？」から本人を選んでください（新しく増やしません）。`)
      return
    }
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
        {/* 既存ユーザーのログイン（引き継ぎID） */}
        {!state.settings.householdId ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="mb-1 text-sm font-bold text-slate-700">すでに使っている方はこちら（ログイン）</p>
            <p className="mb-2 text-[11px] text-slate-400">
              いつもの端末の 設定 →「あなたのプロフィール」にある<strong>引き継ぎID</strong>を入れると、同じプロフィール（アイコン・名前）とデータでそのまま再開できます。
            </p>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void doJoin()}
                placeholder="引き継ぎID（または参加コード）"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button variant="soft" disabled={joinBusy || !joinCode.trim()} onClick={() => void doJoin()}>
                {joinBusy ? '接続中…' : 'ログイン'}
              </Button>
            </div>
            {joinMsg && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">{joinMsg}</p>}
            <input
              ref={restoreRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onRestore(f)
                e.target.value = ''
              }}
            />
            <button onClick={() => restoreRef.current?.click()} className="mt-2 text-xs font-semibold text-brand-600">
              バックアップファイルから復元する
            </button>
          </div>
        ) : (
          existingMembers.length === 0 && (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
              {cloud.status === 'error' ? `同期エラー: ${cloud.error}` : '接続済み。データを同期しています…'}
            </p>
          )
        )}

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

        {/* 新規登録フォーム（既存メンバーがいる場合は誤登録防止のため折りたたむ） */}
        {existingMembers.length > 0 && !showNewForm ? (
          <button onClick={() => setShowNewForm(true)} className="w-full text-center text-xs font-semibold text-slate-400">
            当てはまる人がいない（新しいメンバーとして登録する）
          </button>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {existingMembers.length > 0 ? '新しいメンバーとして登録：' : 'はじめての方：'}
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
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameErr('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && start()}
                  placeholder="名前（例: ママ / たろう）"
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

            {nameErr && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{nameErr}</p>}

            <Button className="w-full" disabled={!name.trim()} onClick={start}>
              はじめる
            </Button>
            <p className="text-[11px] text-slate-400">あとで設定からいつでも変更できます。</p>
          </>
        )}
      </div>
    </Modal>
  )
}
