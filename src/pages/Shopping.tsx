import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Button, EmptyState, inputClass } from '../components/ui'
import { CartIcon, CheckIcon, PlusIcon, TrashIcon, ShareIcon } from '../components/icons'
import { uid } from '../lib/util'

export function Shopping() {
  const { state, addShopping, toggleShopping, removeShopping, clearCheckedShopping } = useStore()
  const [name, setName] = useState('')

  const items = state.shopping
  const todo = items.filter((i) => !i.checked)
  const done = items.filter((i) => i.checked)

  function add() {
    const n = name.trim()
    if (!n) return
    addShopping([{ id: uid(), name: n, checked: false, createdAt: Date.now() }])
    setName('')
  }

  async function share() {
    const text = `${state.settings.householdName}の買い物リスト\n` + todo.map((i) => `□ ${i.name}${i.qty ? ` ${i.qty}` : ''}`).join('\n')
    try {
      if (navigator.share) await navigator.share({ title: '買い物リスト', text })
      else {
        await navigator.clipboard.writeText(text)
        alert('リストをコピーしました（家族に貼り付けて共有できます）')
      }
    } catch {
      /* ユーザーキャンセル */
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="牛乳、たまご など"
          />
          <Button onClick={add} disabled={!name.trim()}>
            <PlusIcon width={18} height={18} />
          </Button>
        </div>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={<CartIcon width={40} height={40} />}
          title="買い物リストは空です"
          desc="レシピや献立から材料をワンタップで追加したり、上の欄から手入力できます。"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-500">未購入（{todo.length}）</h2>
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
                  >
                    <CheckIcon width={16} height={16} />
                  </button>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{i.name}</p>
                    {(i.qty || i.fromRecipeId || by) && (
                      <p className="text-xs text-slate-400">
                        {i.qty ?? ''} {i.fromRecipeId ? '・レシピより' : ''} {by ? `・${by.name}` : ''}
                      </p>
                    )}
                  </div>
                  <button onClick={() => removeShopping(i.id)} className="p-1.5 text-slate-300 active:text-red-500">
                    <TrashIcon width={18} height={18} />
                  </button>
                </Card>
              )
            })}
            {todo.length === 0 && <p className="py-4 text-center text-sm text-slate-400">未購入はありません</p>}
          </div>

          {done.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-2">
                <h2 className="text-sm font-bold text-slate-400">購入済み（{done.length}）</h2>
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
                    <p className="flex-1 text-slate-400 line-through">{i.name}</p>
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
