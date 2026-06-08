import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Button, Field, inputClass, Spinner, EmptyState, Badge, Modal } from '../components/ui'
import { MealIcon, SparkleIcon, CartIcon, TrashIcon } from '../components/icons'
import { suggestDinner, GeminiError, type MealSuggestion } from '../lib/gemini'
import { demoDinner } from '../lib/demo'
import { addDaysISO, formatJpDate, todayISO, uid } from '../lib/util'
import type { Recipe } from '../types'

export function Meals() {
  const store = useStore()
  const { state } = store
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null)
  const [usedDemo, setUsedDemo] = useState(false)
  const [recipeView, setRecipeView] = useState<Recipe | null>(null)

  const meal = state.meals.find((m) => m.date === date)
  const schoolLunch = meal?.schoolLunch ?? ''

  const recentDinners = useMemo(
    () =>
      [...state.meals]
        .filter((m) => m.date < date && m.dinner)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 4)
        .map((m) => m.dinner!)
    ,
    [state.meals, date],
  )

  function setSchoolLunch(v: string) {
    store.upsertMeal({
      id: meal?.id ?? uid(),
      date,
      schoolLunch: v,
      breakfast: meal?.breakfast,
      lunch: meal?.lunch,
      dinner: meal?.dinner,
      recipeIds: meal?.recipeIds ?? [],
      note: meal?.note,
      createdAt: meal?.createdAt ?? Date.now(),
    })
  }

  async function suggest() {
    setLoading(true)
    setError('')
    setSuggestion(null)
    const ctx = {
      date,
      schoolLunch: schoolLunch || undefined,
      recentDinners,
      availableRecipes: state.recipes.map((r) => ({ title: r.title, ingredients: r.ingredients })),
    }
    try {
      let res: MealSuggestion
      try {
        res = await suggestDinner(ctx, state.settings)
        setUsedDemo(false)
      } catch (e) {
        if (e instanceof GeminiError && e.message === 'NO_KEY') {
          res = demoDinner(ctx)
          setUsedDemo(true)
        } else throw e
      }
      setSuggestion(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提案に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  function adopt(addToCart: boolean) {
    if (!suggestion) return
    store.upsertMeal({
      id: meal?.id ?? uid(),
      date,
      schoolLunch: schoolLunch || undefined,
      breakfast: meal?.breakfast,
      lunch: meal?.lunch,
      dinner: suggestion.dinner,
      recipeIds: meal?.recipeIds ?? [],
      note: suggestion.reason,
      createdAt: meal?.createdAt ?? Date.now(),
    })
    if (addToCart && suggestion.ingredients.length) {
      store.addShopping(
        suggestion.ingredients.map((name) => ({ id: uid(), name, checked: false, createdAt: Date.now() })),
      )
    }
    setSuggestion(null)
  }

  return (
    <div className="space-y-4">
      {/* 日付切替 */}
      <div className="flex items-center gap-2">
        <button onClick={() => setDate((d) => addDaysISO(d, -1))} className="rounded-lg bg-white px-3 py-2 text-slate-400 ring-1 ring-slate-200 active:bg-slate-50">‹</button>
        <div className="flex-1 rounded-xl bg-white py-2 text-center font-bold text-slate-800 ring-1 ring-slate-200">
          {formatJpDate(date)}
          {date === todayISO() && <span className="ml-1 text-xs text-brand-600">(今日)</span>}
        </div>
        <button onClick={() => setDate((d) => addDaysISO(d, 1))} className="rounded-lg bg-white px-3 py-2 text-slate-400 ring-1 ring-slate-200 active:bg-slate-50">›</button>
      </div>

      {/* 給食入力 */}
      <Card className="p-4">
        <Field label="🏫 今日の学校給食（被り回避に使用）" hint="献立提案時、給食と主菜・食材が被らないようAIが考慮します。">
          <input
            className={inputClass}
            value={schoolLunch}
            onChange={(e) => setSchoolLunch(e.target.value)}
            placeholder="例: カレーライス、ひじきの煮物"
          />
        </Field>
      </Card>

      {/* AI献立 */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">今日の献立（夕食）</h2>
          <Button variant="soft" onClick={suggest} disabled={loading}>
            {loading ? <Spinner /> : <SparkleIcon width={18} height={18} />}
            AIに提案
          </Button>
        </div>

        {meal?.dinner && !suggestion && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-red-500">
              <MealIcon width={22} height={22} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800">{meal.dinner}</p>
              {meal.note && <p className="text-xs text-slate-500">{meal.note}</p>}
            </div>
            <button onClick={() => store.upsertMeal({ ...meal, dinner: undefined, note: undefined })} className="text-slate-300 active:text-red-500">
              <TrashIcon width={18} height={18} />
            </button>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {suggestion && (
          <div className="animate-pop space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            {usedDemo && <Badge color="#d97706">デモ提案</Badge>}
            <div>
              <p className="text-lg font-extrabold text-slate-800">{suggestion.dinner}</p>
              <p className="mt-0.5 text-sm text-slate-500">{suggestion.reason}</p>
            </div>
            {suggestion.ingredients.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400">材料</p>
                <p className="text-sm text-slate-600">{suggestion.ingredients.join('、')}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={suggest} disabled={loading}>
                別の案
              </Button>
              <Button className="flex-1" onClick={() => adopt(false)}>
                採用
              </Button>
              <Button className="flex-[1.4]" onClick={() => adopt(true)}>
                <CartIcon width={16} height={16} /> 採用+買い物へ
              </Button>
            </div>
          </div>
        )}

        {!meal?.dinner && !suggestion && !error && (
          <p className="py-3 text-center text-sm text-slate-400">
            「AIに提案」を押すと、給食や最近の献立を踏まえた夕食を提案します。
          </p>
        )}
      </Card>

      {/* 保存レシピ */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-500">保存レシピ（{state.recipes.length}）</h2>
        {state.recipes.length === 0 ? (
          <EmptyState
            icon={<MealIcon width={36} height={36} />}
            title="レシピがありません"
            desc="レシピの切り抜きをスキャンすると、材料つきでここに保存されます。"
          />
        ) : (
          <div className="space-y-2">
            {state.recipes.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex gap-3">
                  {r.image && <img src={r.image} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />}
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{r.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-400">{r.ingredients.join('、')}</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => setRecipeView(r)} className="text-xs font-semibold text-brand-600">作り方</button>
                      <button
                        onClick={() =>
                          store.addShopping(
                            r.ingredients.map((name) => ({ id: uid(), name, checked: false, fromRecipeId: r.id, createdAt: Date.now() })),
                          )
                        }
                        className="text-xs font-semibold text-slate-500"
                      >
                        材料を買い物へ
                      </button>
                      <button
                        onClick={() => { if (confirm('削除しますか？')) store.removeRecipe(r.id) }}
                        className="ml-auto text-xs text-slate-300"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!recipeView} onClose={() => setRecipeView(null)} title={recipeView?.title}>
        {recipeView && (
          <div className="space-y-3">
            {recipeView.servings && <Badge color="#ef4444">{recipeView.servings}</Badge>}
            <div>
              <p className="mb-1 text-xs font-bold text-slate-400">材料</p>
              <ul className="list-inside list-disc text-sm text-slate-700">
                {recipeView.ingredients.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-400">作り方</p>
              <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
                {recipeView.steps.map((x, i) => <li key={i}>{x}</li>)}
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
