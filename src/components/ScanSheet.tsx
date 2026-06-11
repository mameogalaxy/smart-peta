import { useRef, useState } from 'react'
import { Modal, Button, Field, inputClass, Spinner, Badge } from './ui'
import { CameraIcon, CloseIcon, SparkleIcon } from './icons'
import { useStore } from '../lib/store'
import { scanDocument, analyzeDocumentText, GeminiError, type ScanResult } from '../lib/gemini'
import { demoScan } from '../lib/demo'
import { classifyByKeywords, extractDates } from '../lib/classify'
import { fileToScanData, isPdfDataUrl, todayISO, uid, formatJpDate } from '../lib/util'
import { DOC_CATEGORIES, type DocCategory } from '../types'
import { CategoryIcon } from './CategoryIcon'
import { DocIcon } from './icons'

type Phase = 'pick' | 'confirm' | 'analyzing' | 'review'

export function ScanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore()
  const aiSettings = store.aiSettings
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('pick')
  const [images, setImages] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [usedDemo, setUsedDemo] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  // レビュー画面の編集状態
  const [pickedEvents, setPickedEvents] = useState<Set<number>>(new Set())
  const [addIngredients, setAddIngredients] = useState(true)
  const [category, setCategory] = useState<DocCategory>('other')
  const [title, setTitle] = useState('')
  // 手入力（テキスト貼り付け）モード
  const [manualText, setManualText] = useState('')
  const [isManual, setIsManual] = useState(false)
  const [refining, setRefining] = useState(false)
  // 撮影後のAIへの追加指示（任意）
  const [instruction, setInstruction] = useState('')

  function reset() {
    setPhase('pick')
    setImages([])
    setError('')
    setResult(null)
    setUsedDemo(false)
    setPickedEvents(new Set())
    setCategory('other')
    setTitle('')
    setManualText('')
    setIsManual(false)
    setRefining(false)
    setInstruction('')
  }

  function close() {
    reset()
    onClose()
  }

  async function onFiles(files: FileList) {
    setError('')
    const smalls: string[] = []
    for (const f of Array.from(files)) {
      smalls.push(await fileToScanData(f))
    }
    setImages((prev) => [...prev, ...smalls])
    setPhase('confirm')
  }

  function toReview(res: ScanResult, opts: { demo?: boolean; manual?: boolean } = {}) {
    setResult(res)
    setCategory(res.category)
    setTitle(res.title)
    setPickedEvents(new Set(res.events.map((_, i) => i)))
    setUsedDemo(!!opts.demo)
    setIsManual(!!opts.manual)
    setPhase('review')
  }

  async function analyze() {
    if (!images.length) return
    setPhase('analyzing')
    setError('')
    try {
      let res: ScanResult
      let demo = false
      try {
        res = await scanDocument(images, aiSettings, todayISO(), instruction.trim() || undefined)
      } catch (e) {
        if (e instanceof GeminiError && e.message === 'NO_KEY') {
          res = demoScan()
          demo = true
        } else {
          throw e
        }
      }
      toReview(res, { demo })
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析に失敗しました。')
      setPhase('confirm')
    }
  }

  /** 貼り付けたテキストから（AI不要で）登録 */
  function analyzeManual() {
    const t = manualText.trim()
    if (!t) return
    const firstLine = t.split(/\n+/).map((s) => s.trim()).filter(Boolean)[0] ?? '書類'
    const res: ScanResult = {
      title: firstLine.slice(0, 30),
      category: classifyByKeywords(t),
      summary: t.replace(/\s+/g, ' ').slice(0, 80),
      text: t,
      events: extractDates(t, todayISO()),
    }
    setImages([])
    toReview(res, { manual: true })
  }

  /** 貼り付けたテキストをAIで整理（分類・要約・予定を補完） */
  async function refineWithAI() {
    if (!result) return
    setRefining(true)
    setError('')
    try {
      const res = await analyzeDocumentText(result.text, aiSettings, todayISO())
      toReview(res, { manual: false })
    } catch (e) {
      setError(
        e instanceof GeminiError && e.message === 'NO_KEY'
          ? 'Gemini APIキーが未設定です（設定から登録できます）。'
          : e instanceof Error
            ? e.message
            : 'AI整理に失敗しました。',
      )
    } finally {
      setRefining(false)
    }
  }

  function save() {
    if (!result) return
    const now = Date.now()
    const docId = uid()
    // 画像（PDFは表示できないため除外）。複数枚は全部保存してスライド表示。代表＝先頭。
    const imgs = images.filter((x) => !isPdfDataUrl(x))
    const image = imgs[0] ?? ''
    store.addDoc({
      id: docId,
      title: title || result.title,
      category,
      text: result.text,
      summary: result.summary,
      image,
      images: imgs.length > 1 ? imgs : undefined,
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
      {/* ファイル入力は常時マウント（confirm画面の「追加」からも使うため） */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length) void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {phase === 'pick' && (
        <div>
          <p className="mb-4 text-sm text-slate-500">
            プリントを撮影/選択すると、AIが文字を読み取って自動で分類・整理します。<strong>複数枚</strong>や<strong>PDF</strong>もOK。
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 py-10 text-brand-600 active:bg-brand-100"
          >
            <CameraIcon width={40} height={40} />
            <span className="font-bold">写真・PDFを選ぶ（複数可）</span>
            <span className="text-xs text-brand-500">学校のプリント・ゴミの日・レシピ・PDF配布物など</span>
          </button>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {!aiSettings.geminiApiKey && (
            <p className="mt-3 text-center text-xs text-slate-400">
              ※ Gemini APIキー未設定のため<strong>デモ解析</strong>で動作します（設定から登録可）。
            </p>
          )}

          {/* AI不要：文字を貼り付けて登録 */}
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />または<span className="h-px flex-1 bg-slate-200" />
          </div>
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-600">文字を貼り付けて登録（AI不要）</span>
            <textarea
              className={`${inputClass} min-h-24`}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="写真の文字を長押しコピー（テキスト認識）して、ここに貼り付け。自動でカテゴリ分け・日付抽出します。"
            />
            <Button className="mt-2 w-full" variant="soft" onClick={analyzeManual} disabled={!manualText.trim()}>
              この内容で登録
            </Button>
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                {isPdfDataUrl(src) ? (
                  <div className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                    <DocIcon width={22} height={22} />
                    <span className="text-[10px] font-bold">PDF</span>
                  </div>
                ) : (
                  <img src={src} alt="" className="h-20 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
                )}
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white"
                  aria-label="削除"
                >
                  <CloseIcon width={12} height={12} />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand-300 text-brand-500"
            >
              <CameraIcon width={20} height={20} />
              <span className="text-[10px] font-bold">追加</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">{images.length}件を1つの書類としてまとめて読み取ります（PDFはページごと自動で読み取り）。</p>
          <Field label="AIへの指示（任意）" hint="例: 提出期限だけ拾って / 材料を英語で / ゴミの分別を箇条書きで。空欄でもOK。">
            <textarea
              className={`${inputClass} min-h-20`}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="指示があれば入力（空欄でそのまま解析）"
            />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={reset}>
              戻る
            </Button>
            <Button className="flex-[2]" disabled={!images.length} onClick={analyze}>
              <SparkleIcon width={18} height={18} /> AIで解析
            </Button>
          </div>
          {!aiSettings.geminiApiKey && (
            <p className="text-center text-xs text-slate-400">※ APIキー未設定のためデモ解析になります（指示は反映されません）。</p>
          )}
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="flex flex-col items-center py-10">
          {images.find((x) => !isPdfDataUrl(x)) && (
            <img src={images.find((x) => !isPdfDataUrl(x))} alt="" className="mb-4 max-h-48 rounded-xl object-contain" />
          )}
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
          {isManual && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              貼り付けたテキストから自動でカテゴリ・日付を判定しました。
              {aiSettings.geminiApiKey && (
                <button onClick={refineWithAI} disabled={refining} className="ml-1 font-bold text-brand-600">
                  {refining ? '整理中…' : 'AIでさらに整理する'}
                </button>
              )}
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            {images.find((x) => !isPdfDataUrl(x)) && (
              <img src={images.find((x) => !isPdfDataUrl(x))} alt="" className="h-24 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
            )}
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
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    category === c.id ? 'text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                  style={category === c.id ? { backgroundColor: c.color } : undefined}
                >
                  <CategoryIcon cat={c.id} size={15} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-400">{isManual ? '内容' : 'AI要約'}</p>
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
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-600">
                  <CategoryIcon cat="recipe" size={16} /> レシピとして保存
                </p>
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
              やり直す
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
