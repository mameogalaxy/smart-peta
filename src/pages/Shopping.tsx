import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Button, EmptyState, inputClass } from '../components/ui'
import { CartIcon, CheckIcon, PlusIcon, TrashIcon, ShareIcon, LinkIcon } from '../components/icons'
import { Avatar } from '../components/Avatar'
import { uid } from '../lib/util'
import { SHOPPING_TEMPLATES } from '../lib/templates'

type Mode = 'buy' | 'wish'

export function Shopping() {
  const { state, addShopping, toggleShopping, removeShopping, clearCheckedShopping } = useStore()
  const [mode, setMode] = useState<Mode>('buy')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [grp, setGrp] = useState(0)
  const [filterMember, setFilterMember] = useState<string>('all')

  const me = state.settings.memberId
  // 表示順：家族全員 → 本人 → 本人以外
  const orderedFamily = useMemo(() => {
    const self = state.family.filter((f) => f.id === me)
    const others = state.family.filter((f) => f.id !== me)
    return [...self, ...others]
  }, [state.family, me])

  const items = useMemo(() => {
    const isWish = mode === 'wish'
    return state.shopping
      .filter((i) => !!i.wish === isWish)
      .filter((i) => filterMember === 'all' || i.addedBy === filterMember)
  }, [state.shopping, mode, filterMember])

  const todo = items.filter((i) => !i.checked)
  const done = items.filter((i) => i.checked)
  const pending = new Set(state.shopping.filter((i) => !i.wish && !i.checked).map((i) => i.name))

  function add() {
    const n = name.trim()
    if (!n) return
    addShopping([
      {
        id: uid(),
        name: n,
        checked: false,
        addedBy: me || undefined,
        wish: mode === 'wish' ? true : undefined,
        url: mode === 'wish' && url.trim() ? url.trim() : undefined,
        createdAt: Date.now(),
      },
    ])
    setName('')
    setUrl('')
  }

  function quickAdd(n: string) {
    if (pending.has(n)) return
    addShopping([{ id: uid(), name: n, checked: false, addedBy: me || undefined, createdAt: Date.now() }])
  }

  async function share() {
    const title = mode === 'wish' ? '欲しいものリスト' : '買い物リスト'
    const text =
      `${state.settings.householdName}の${title}\n` +
      todo
        .map((i) => `□ ${i.name}${i.qty ? ` ${i.qty}` : ''}${i.url ? `\n  ${i.url}` : ''}`)
        .join('\n')
    try {
      if (navigator.share) await navigator.share({ title, text })
      else {
        await navigator.clipboard.writeText(text)
        alert('リストをコピーしました（家族に貼り付けて共有できます）')
      }
    } catch {
      /* ユーザーキャンセル */
    }
  }

  const isWish = mode === 'wish'

  return (
    <div className="space-y-4">
      {/* 買い物 / 欲しいもの 切替 */}
      <div className="flex rounded-full bg-slate-100 p-0.5 text-sm font-semibold">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 rounded-full py-1.5 transition ${mode === 'buy' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}
        >
          買い物リスト
        </button>
        <button
          onClick={() => setMode('wish')}
          className={`flex-1 rounded-full py-1.5 transition ${mode === 'wish' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}
        >
          欲しいもの
        </button>
      </div>

      <Card className="space-y-2 p-3">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={isWish ? '欲しいもの（例: 新しい炊飯器）' : '牛乳、たまご など'}
          />
          <Button onClick={add} disabled={!name.trim()}>
            <PlusIcon width={18} height={18} />
          </Button>
        </div>
        {isWish && (
          <input
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="URL（任意・商品ページなど）"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
          />
        )}
      </Card>

      {/* よく買うもの（買い物リストのみ） */}
      {!isWish && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-bold text-slate-500">よく買うものをタップで追加</p>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {SHOPPING_TEMPLATES.map((g, idx) => (
              <button
                key={g.label}
                onClick={() => setGrp(idx)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
                  grp === idx ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SHOPPING_TEMPLATES[grp].items.map((n) => {
              const added = pending.has(n)
              return (
                <button
                  key={n}
                  onClick={() => quickAdd(n)}
                  disabled={added}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    added
                      ? 'border-brand-200 bg-brand-50 text-brand-400'
                      : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                  }`}
                >
                  {added ? <CheckIcon width={14} height={14} /> : <PlusIcon width={14} height={14} />} {n}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* 表示する人で絞り込み（全員 → 自分 → 他） */}
      {state.family.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterMember('all')}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${filterMember === 'all' ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
          >
            家族全体
          </button>
          {orderedFamily.map((f) => {
            const active = filterMember === f.id
            const isSelf = f.id === me
            return (
              <button
                key={f.id}
                onClick={() => setFilterMember(f.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
              >
                <Avatar member={f} size={18} /> {isSelf ? `${f.name}(自分)` : f.name}
              </button>
            )
          })}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CartIcon width={40} height={40} />}
          title={isWish ? '欲しいものリストは空です' : '買い物リストは空です'}
          desc={
            isWish
              ? '欲しいものとURLを登録しておくと、家族で共有してタップで商品ページに飛べます。'
              : 'レシピや献立から材料をワンタップで追加したり、上の欄から手入力できます。'
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-500">{isWish ? '欲しいもの' : '未購入'}（{todo.length}）</h2>
            <button onClick={share} className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              <ShareIcon width={16} height={16} /> 家族に共有
            </button>
          </div>
          <div className="space-y-2">
            {todo.map((i) => {
              const by = state.family.find((f) => f.id === i.addedBy)
              return (
                <Card key={i.id} className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => toggleShopping(i.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-transparent active:border-brand-500"
                    aria-label={isWish ? '購入済みにする' : '購入済みにする'}
                  >
                    <CheckIcon width={16} height={16} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{i.name}</p>
                    {(i.qty || i.fromRecipeId || by) && (
                      <p className="truncate text-xs text-slate-400">
                        {i.qty ?? ''} {i.fromRecipeId ? '・レシピより' : ''} {by ? `・${by.name}` : ''}
                      </p>
                    )}
                  </div>
                  {i.url && (
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700 active:bg-brand-100"
                    >
                      <LinkIcon width={15} height={15} /> 開く
                    </a>
                  )}
                  <button onClick={() => removeShopping(i.id)} className="p-1.5 text-slate-300 active:text-red-500" aria-label="削除">
                    <TrashIcon width={18} height={18} />
                  </button>
                </Card>
              )
            })}
          </div>

          {done.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-2">
                <h2 className="text-sm font-bold text-slate-400">{isWish ? '購入済み' : '購入済み'}（{done.length}）</h2>
                <button onClick={clearCheckedShopping} className="text-xs font-semibold text-slate-400">
                  まとめて削除
                </button>
              </div>
              <div className="space-y-2 opacity-70">
                {done.map((i) => (
                  <Card key={i.id} className="flex items-center gap-3 p-3">
                    <button
                      onClick={() => toggleShopping(i.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-500 bg-brand-500 text-white"
                    >
                      <CheckIcon width={16} height={16} />
                    </button>
                    <p className="min-w-0 flex-1 truncate text-slate-400 line-through">{i.name}</p>
                    {i.url && (
                      <a href={i.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-300" aria-label="開く">
                        <LinkIcon width={16} height={16} />
                      </a>
                    )}
                    <button onClick={() => removeShopping(i.id)} className="p-1.5 text-slate-300">
                      <TrashIcon width={18} height={18} />
                    </button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
