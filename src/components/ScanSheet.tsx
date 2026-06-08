import { useRef, useState } from 'react'
import { Modal, Button, Field, inputClass, Spinner, Badge } from './ui'
import { CameraIcon, SparkleIcon } from './icons'
import { useStore } from '../lib/store'
import { scanDocument, GeminiError, type ScanResult } from '../lib/gemini'
import { demoScan } from '../lib/demo'
import { downscaleImage, fileToDataUrl, todayISO, uid, formatJpDate } from '../lib/util'
import { DOC_CATEGORIES, type DocCategory } from '../types'

type Phase = 'pick' | 'analyzing' | 'review'

export function ScanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore()
  const { settings } = store.state
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('pick')
  const [image, setImage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [usedDemo, setUsedDemo] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  // レビュー画面の編集状態
  const [pickedEvents, setPickedEvents] = useState<Set<number>>(new Set())
  const [addIngredients, setAddIngredients] = useState(true)
  const [category, setCategory] = useState<DocCategory>('other')
  const [title, setTitle] = useState('')

  function reset() {
    setPhase('pick')
    setImage('')
    setError('')
    setResult(null)
    setUsedDemo(false)
    setPickedEvents(new Set())
    setCategory('other')
    setTitle('')
  }

  function close() {
    reset()
    onClose()
  }

  async function onFile(file: File) {
    setError('')
    const raw = await fileToDataUrl(file)
    const small = await downscaleImage(raw).catch(() => raw)
    setImage(small)
    await analyze(small)
  }

  async function analyze(img: string) {
    setPhase('analyzing')
    setError('')
    try {
      let res: ScanResult
      try {
        res = await scanDocument(img, settings, todayISO())
        setUsedDemo(false)
      } catch (e) {
        if (e instanceof GeminiError && e.message === 'NO_KEY') {
          res = demoScan()
          setUsedDemo(true)
        } else {
          throw e
        }
      }
      setResult(res)
      setCategory(res.category)
      setTitle(res.title)
      setPickedEvents(new Set(res.events.map((_, i) => i)))
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析に失敗しました。')
      setPhase('pick')
    }
  }

  function save() {
    if (!result) return
    const now = Date.now()
    const docId = uid()
    store.addDoc({
      id: docId,
      title: title || result.title,
      category,
      text: result.text,
      summary: result.summary,
      image,
      createdAt: now,
    })

    const events = result.events
      .filter((_, i) => pickedEvents.has(i))
      .map((e) => ({
        id: uid(),
        title: e.title,
        date: e.date,
        time: e.time,
        note: e.note,
        category,
        docId,
        remind: true,
        done: false,
        createdAt: now,
      }))
    if (events.length) store.addEvents(events)

    if (result.recipe && category === 'recipe') {
      const recipeId = uid()
      store.addRecipe({
        id: recipeId,
        title: title || result.title,
        ingredients: result.recipe.ingredients,
        steps: result.recipe.steps,
        servings: result.recipe.servings,
        tags: ['スキャン'],
        image,
        createdAt: now,
      })
      if (addIngredients) {
        store.addShopping(
          result.recipe.ingredients.map((name) => ({
            id: uid(),
            name,
            checked: false,
            fromRecipeId: recipeId,
            createdAt: now,
          })),
        )
      }
    }
    close()
  }

  return (
    <Modal open={open} onClose={close} title="書類をスキャン">
      {phase === 'pick' && (
        <div>
          <p className="mb-4 text-sm text-slate-500">
            プリントを撮影すると、AIが文字を読み取って自動で分類・整理します。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 py-10 text-brand-600 active:bg-brand-100"
          >
            <CameraIcon width={40} height={40} />
            <span className="font-bold">写真を撮る / 選ぶ</span>
            <span className="text-xs text-brand-500">学校のプリント・ゴミの日・レシピなど</span>
          </button>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {!settings.geminiApiKey && (
            <p className="mt-3 text-center text-xs text-slate-400">
              ※ Gemini APIキー未設定のため<strong>デモ解析</strong>で動作します（設定から登録可）。
            </p>
          )}
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="flex flex-col items-center py-10">
          {image && <img src={image} alt="" className="mb-4 max-h-48 rounded-xl object-contain" />}
          <div className="flex items-center gap-2 font-semibold text-brand-600">
            <Spinner /> AIが解析中…
          </div>
          <p className="mt-1 text-xs text-slate-400">文字認識・分類・予定の抽出をしています</p>
        </div>
      )}

      {phase === 'review' && result && (
        <div className="space-y-4">
          {usedDemo && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              デモ解析の結果です（APIキー未設定）。実際の写真の内容は読み取っていません。
            </p>
          )}
          <div className="flex gap-3">
            {image && <img src={image} alt="" className="h-24 w-20 rounded-lg object-cover ring-1 ring-slate-200" />}
            <div className="flex-1">
              <Field label="タイトル">
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-600">分類</span>
            <div className="flex flex-wrap gap-2">
              {DOC_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    category === c.id ? 'text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                  style={category === c.id ? { backgroundColor: c.color } : undefined}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-400">AI要約</p>
            <p className="mt-1 text-sm text-slate-700">{result.summary}</p>
          </div>

          {result.events.length > 0 && (
            <div>
              <span className="mb-1 block text-sm font-semibold text-slate-600">
                カレンダーに追加する予定
              </span>
              <div className="space-y-2">
                {result.events.map((e, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={pickedEvents.has(i)}
                      onChange={() =>
                        setPickedEvents((prev) => {
                          const n = new Set(prev)
                          if (n.has(i)) n.delete(i)
                          else n.add(i)
                          return n
                        })
                      }
                      className="h-5 w-5 accent-brand-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700">{e.title}</div>
                      <div className="text-xs text-slate-400">
                        {formatJpDate(e.date)} {e.time ?? ''} {e.note ? `・${e.note}` : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {result.recipe && category === 'recipe' && (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-600">🍳 レシピとして保存</p>
                <Badge color="#ef4444">{result.recipe.ingredients.length}品の材料</Badge>
              </div>
              <p className="text-xs text-slate-400">{result.recipe.ingredients.join('、')}</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={addIngredients}
                  onChange={(e) => setAddIngredients(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                材料を買い物リストに追加する
              </label>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={reset}>
              撮り直す
            </Button>
            <Button className="flex-[2]" onClick={save}>
              <SparkleIcon width={18} height={18} /> 保存する
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
