import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Button, Field, inputClass, Spinner, EmptyState, Badge, Modal } from '../components/ui'
import { MealIcon, SparkleIcon, CartIcon, TrashIcon, CameraIcon, PlusIcon, CloseIcon, CheckIcon, DownloadIcon } from '../components/icons'
import { suggestDinner, scanLunchMenu, scanFridge, GeminiError, type MealSuggestion } from '../lib/gemini'
import { demoDinner, demoLunchMenu, demoFridge } from '../lib/demo'
import { addDaysISO, downscaleImage, fileToDataUrl, fileToScanData, formatJpDate, saveImagesToDevice, todayISO, uid } from '../lib/util'
import type { MealCourse, Recipe } from '../types'
import { useConfirm } from '../lib/confirm'
import { renderPdfPages } from '../lib/pdf'
import { ImageLightbox } from '../components/ImageLightbox'
import type { LunchMenuSheet } from '../types'

const DEFAULT_MOODS = ['おまかせ', 'ガッツリ', 'あっさり', '時短', '野菜多め']
const COOKING_METHODS = ['おまかせ', '焼く', '煮る', '蒸す', '揚げる', '炒める', '和える', 'オーブン', '火を使わない']
const COURSE_OPTIONS: { value: MealCourse; label: string }[] = [
  { value: 'main', label: '主菜' },
  { value: 'staple', label: '主食' },
  { value: 'side', label: '副菜' },
  { value: 'soup', label: '汁物' },
]

function courseLabel(course: MealCourse): string {
  return COURSE_OPTIONS.find((option) => option.value === course)?.label ?? course
}

export function Meals() {
  const store = useStore()
  const { state } = store
  const aiSettings = store.aiSettings
  const confirm = useConfirm()
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null)
  const [usedDemo, setUsedDemo] = useState(false)
  const [recipeView, setRecipeView] = useState<Recipe | null>(null)
  const lunchRef = useRef<HTMLInputElement>(null)
  const [scanningLunch, setScanningLunch] = useState(false)
  const [lunchMsg, setLunchMsg] = useState('')
  const [lunchSheetView, setLunchSheetView] = useState<LunchMenuSheet | null>(null)
  const [lunchLightbox, setLunchLightbox] = useState<string | null>(null)
  const [savingLunchImages, setSavingLunchImages] = useState(false)
  const fridgeRef = useRef<HTMLInputElement>(null)
  const [scanningFridge, setScanningFridge] = useState(false)
  const [fridgeMsg, setFridgeMsg] = useState('')
  const [fridgeInput, setFridgeInput] = useState('')
  const [mood, setMood] = useState('おまかせ')
  const [courses, setCourses] = useState<MealCourse[]>(['main', 'staple', 'side', 'soup'])
  const [moodModal, setMoodModal] = useState(false)
  const [newMood, setNewMood] = useState('')
  const [cookingMethod, setCookingMethod] = useState('おまかせ')
  const [recipeMsg, setRecipeMsg] = useState('')

  const meal = state.meals.find((m) => m.date === date)
  const schoolLunch = meal?.schoolLunch ?? ''
  const moodOptions = [...DEFAULT_MOODS, ...state.customMealMoods.filter((value) => !DEFAULT_MOODS.includes(value))]
  const normalizedNewMood = newMood.trim()
  const moodAlreadyExists = moodOptions.some((value) => value.toLowerCase() === normalizedNewMood.toLowerCase())

  function saveMood() {
    if (!normalizedNewMood || moodAlreadyExists) return
    store.addMealMood(normalizedNewMood)
    setMood(normalizedNewMood)
    setNewMood('')
    setMoodModal(false)
  }

  useEffect(() => {
    setSuggestion(null)
    setError('')
    setRecipeMsg('')
  }, [date, mood, courses, cookingMethod])

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
  const recentCookingMethods = useMemo(
    () =>
      [...state.meals]
        .filter((m) => m.date < date && m.dinnerCookingMethod)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 4)
        .map((m) => m.dinnerCookingMethod!),
    [state.meals, date],
  )
  const orderedLunchMenuSheets = useMemo(() => {
    const selectedMonth = date.slice(0, 7)
    return [...state.lunchMenuSheets].sort((a, b) => {
      const aMatches = a.startDate?.startsWith(selectedMonth) ? 1 : 0
      const bMatches = b.startDate?.startsWith(selectedMonth) ? 1 : 0
      return bMatches - aMatches || b.createdAt - a.createdAt
    })
  }, [state.lunchMenuSheets, date])

  function setSchoolLunch(v: string) {
    store.upsertMeal({
      id: meal?.id ?? uid(),
      date,
      schoolLunch: v,
      breakfast: meal?.breakfast,
      lunch: meal?.lunch,
      dinner: meal?.dinner,
      dinnerDishes: meal?.dinnerDishes,
      dinnerMood: meal?.dinnerMood,
      dinnerCookingMethod: meal?.dinnerCookingMethod,
      nutritionNote: meal?.nutritionNote,
      recipeIds: meal?.recipeIds ?? [],
      note: meal?.note,
      createdAt: meal?.createdAt ?? Date.now(),
    })
  }

  async function onLunchFiles(files: FileList) {
    setLunchMsg('')
    setScanningLunch(true)
    try {
      const scanInputs: string[] = []
      const savedPages: string[] = []
      for (const file of Array.from(files)) {
        if (file.type === 'application/pdf') {
          scanInputs.push(await fileToScanData(file))
          const rendered = await renderPdfPages(file, 31)
          savedPages.push(...rendered.pages)
        } else {
          const raw = await fileToDataUrl(file)
          const image = await downscaleImage(raw, 1400, 0.82).catch(() => raw)
          scanInputs.push(image)
          savedPages.push(image)
        }
      }
      let res
      try {
        res = await scanLunchMenu(scanInputs, aiSettings, todayISO())
      } catch (e) {
        if (e instanceof GeminiError && e.message === 'NO_KEY') res = demoLunchMenu()
        else throw e
      }
      store.setSchoolLunches(res.items)
      const dates = res.items.map((item) => item.date).filter(Boolean).sort()
      const startDate = dates[0]
      const endDate = dates[dates.length - 1]
      const title = startDate
        ? `${Number(startDate.slice(0, 4))}年${Number(startDate.slice(5, 7))}月 給食献立表`
        : `給食献立表 ${formatJpDate(todayISO())}`
      store.addLunchMenuSheet({
        id: uid(),
        title,
        images: savedPages,
        startDate,
        endDate,
        itemCount: res.items.length,
        createdAt: Date.now(),
      })
      const todayItem = res.items.find((i) => i.date === todayISO())
      setLunchMsg(
        `${res.items.length}日分の給食と献立表${savedPages.length}ページを登録しました。` + (todayItem ? `今日は「${todayItem.menu}」です。` : ''),
      )
    } catch (e) {
      setLunchMsg(e instanceof Error ? e.message : '読み取りに失敗しました。')
    } finally {
      setScanningLunch(false)
    }
  }

  async function onFridgeFiles(files: FileList) {
    setFridgeMsg('')
    setScanningFridge(true)
    try {
      const imgs: string[] = []
      for (const f of Array.from(files)) {
        const raw = await fileToDataUrl(f)
        imgs.push(await downscaleImage(raw).catch(() => raw))
      }
      let res
      try {
        res = await scanFridge(imgs, aiSettings)
      } catch (e) {
        if (e instanceof GeminiError && e.message === 'NO_KEY') res = demoFridge()
        else throw e
      }
      // 実際に新規追加された数を数えて、正直に表示する（既存は重複としてスキップ）
      const have = new Set(state.inventory.map((i) => i.name.trim().toLowerCase()))
      const seen = new Set<string>()
      const addedNames = res.items
        .map((n) => n.trim())
        .filter((n) => {
          const k = n.toLowerCase()
          if (!n || have.has(k) || seen.has(k)) return false
          seen.add(k)
          return true
        })
      store.addInventory(res.items.map((name) => ({ id: uid(), name, createdAt: Date.now() })))
      setFridgeMsg(
        addedNames.length
          ? `${imgs.length}枚を読み取り、新たに${addedNames.length}品を追加しました（${addedNames.join('、')}）。`
          : `${imgs.length}枚を読み取りましたが、すべて登録済みでした。`,
      )
    } catch (e) {
      setFridgeMsg(e instanceof Error ? e.message : '読み取りに失敗しました。')
    } finally {
      setScanningFridge(false)
    }
  }

  function addFridgeManual() {
    const names = fridgeInput
      .split(/[、,\s]+/)
      .map((n) => n.trim())
      .filter(Boolean)
    if (!names.length) return
    store.addInventory(names.map((name) => ({ id: uid(), name, createdAt: Date.now() })))
    setFridgeInput('')
    setFridgeMsg('')
  }

  async function suggest() {
    setLoading(true)
    setError('')
    setRecipeMsg('')
    const previousSuggestion = suggestion
    setSuggestion(null)
    const ctx = {
      date,
      schoolLunch: schoolLunch || undefined,
      recentDinners: previousSuggestion ? [previousSuggestion.dinner, ...recentDinners] : recentDinners,
      availableRecipes: state.recipes.map((r) => ({ title: r.title, ingredients: r.ingredients })),
      fridgeItems: state.inventory.map((i) => i.name),
      mood: mood === 'おまかせ' ? undefined : mood,
      courses,
      cookingMethod: cookingMethod === 'おまかせ' ? undefined : cookingMethod,
      recentCookingMethods: previousSuggestion
        ? [...new Set([previousSuggestion.cookingMethod, ...recentCookingMethods])]
        : recentCookingMethods,
    }
    try {
      let res: MealSuggestion
      try {
        res = await suggestDinner(ctx, aiSettings)
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
      dinnerDishes: suggestion.dishes,
      dinnerMood: mood,
      dinnerCookingMethod: suggestion.cookingMethod,
      nutritionNote: suggestion.nutritionAdvice,
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

  function saveSuggestedRecipe() {
    if (!suggestion) return
    const exists = state.recipes.some((recipe) => recipe.title.trim().toLowerCase() === suggestion.recipeTitle.trim().toLowerCase())
    if (exists) {
      setRecipeMsg('同じ名前のレシピが保存済みです。')
      return
    }
    store.addRecipe({
      id: uid(),
      title: suggestion.recipeTitle,
      ingredients: suggestion.recipeIngredients,
      steps: suggestion.steps,
      servings: suggestion.servings,
      tags: ['AI提案', suggestion.cookingMethod, ...(mood === 'おまかせ' ? [] : [mood])],
      createdAt: Date.now(),
    })
    setRecipeMsg(`「${suggestion.recipeTitle}」を保存レシピに追加しました。`)
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

      {/* 学校給食 */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">学校給食</h2>
          <input
            ref={lunchRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) void onLunchFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button variant="soft" onClick={() => lunchRef.current?.click()} disabled={scanningLunch}>
            {scanningLunch ? <Spinner /> : <CameraIcon width={18} height={18} />} 画像・PDFを登録
          </Button>
        </div>

        {schoolLunch ? (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3">
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-700">{formatJpDate(date)}の給食</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{schoolLunch}</p>
            </div>
            <button onClick={() => store.clearSchoolLunches(date)} aria-label="この日の給食を削除" className="p-1 text-amber-500 active:text-red-500">
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            1か月分の献立表を撮影、または<strong>画像・PDFを複数選択</strong>すると、日付ごとの給食を一括登録できます。元の献立表も保存され、後から見返せます。
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-600">登録した画像・PDF</p>
            {orderedLunchMenuSheets.length > 0 && <span className="text-xs text-slate-400">{orderedLunchMenuSheets.length}件</span>}
          </div>
          {orderedLunchMenuSheets.length > 0 ? (
            <div className="space-y-3">
              {orderedLunchMenuSheets.map((sheet) => (
                <div key={sheet.id} className="overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button type="button" onClick={() => setLunchSheetView(sheet)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold text-slate-700">{sheet.title}</p>
                      <p className="text-xs text-slate-400">{sheet.itemCount}日分・{sheet.images.length || '同期待ち'}ページ</p>
                    </button>
                    <button
                      type="button"
                      aria-label={`${sheet.title}を削除`}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: '献立表を削除',
                            message: `「${sheet.title}」の保存画像を削除しますか？ 日付ごとに登録済みの給食内容は残ります。`,
                            confirmLabel: '削除',
                            danger: true,
                          })
                        ) {
                          store.removeLunchMenuSheet(sheet.id)
                          if (lunchSheetView?.id === sheet.id) setLunchSheetView(null)
                        }
                      }}
                      className="p-2 text-slate-400 active:text-red-500"
                    >
                      <TrashIcon width={18} height={18} />
                    </button>
                  </div>
                  {sheet.images.length > 0 ? (
                    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto border-t border-slate-200 bg-white p-2">
                      {sheet.images.map((image, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setLunchLightbox(image)}
                          className="relative w-[88%] shrink-0 snap-center"
                        >
                          <img
                            src={image}
                            alt={`${sheet.title} ${index + 1}ページ`}
                            className="h-64 w-full rounded-lg bg-slate-50 object-contain"
                          />
                          <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/65 px-2 py-1 text-[11px] font-bold text-white">
                            {index + 1}/{sheet.images.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-slate-200 px-3 py-6 text-center text-xs text-slate-400">画像を同期しています。</div>
                  )}
                </div>
              ))}
              <p className="text-center text-xs text-slate-400">横スワイプでページ切替・タップで拡大</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => lunchRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-5 text-sm font-semibold text-slate-400 active:bg-slate-50"
            >
              <CameraIcon width={20} height={20} /> 登録した画像・PDFはまだありません
            </button>
          )}
        </div>

        <Field label="給食メモ（手入力・修正）" hint="献立提案時、給食と主菜・食材が被らないようAIが考慮します。">
          <input
            className={inputClass}
            value={schoolLunch}
            onChange={(e) => setSchoolLunch(e.target.value)}
            placeholder="例: カレーライス、ひじきの煮物"
          />
        </Field>

        {lunchMsg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">{lunchMsg}</p>}

        {state.meals.some((m) => m.schoolLunch) && (
          <button
            onClick={async () => {
              if (await confirm({ title: '給食を全消去', message: '登録した給食をすべて削除しますか？', confirmLabel: '消去', danger: true })) {
                store.clearSchoolLunches()
              }
            }}
            className="text-xs font-semibold text-slate-400"
          >
            登録した給食をすべて消去
          </button>
        )}
      </Card>

      {/* 冷蔵庫の中身 */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">冷蔵庫の中身</h2>
          <input
            ref={fridgeRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) void onFridgeFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button variant="soft" onClick={() => fridgeRef.current?.click()} disabled={scanningFridge}>
            {scanningFridge ? <Spinner /> : <CameraIcon width={18} height={18} />} 冷蔵庫を撮影/選択
          </Button>
        </div>

        <p className="text-xs text-slate-400">
          冷蔵庫の中を撮影、または写真フォルダから<strong>複数枚まとめて</strong>選ぶとAIが食材を判定して登録します（何回でも追加OK）。AI提案は、ここにある食材を活かして考えます。
        </p>

        <div className="flex gap-2">
          <input
            className={inputClass}
            value={fridgeInput}
            onChange={(e) => setFridgeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addFridgeManual()}
            placeholder="手入力で追加（例: 卵、牛乳、キャベツ）"
          />
          <Button onClick={addFridgeManual} disabled={!fridgeInput.trim()}>
            <PlusIcon width={18} height={18} />
          </Button>
        </div>

        {state.inventory.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {state.inventory.map((i) => (
              <button
                key={i.id}
                onClick={() => store.removeInventory(i.id)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 active:bg-slate-200"
              >
                {i.name}
                <CloseIcon width={13} height={13} className="text-slate-400" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">まだ登録がありません。撮影か手入力で追加してください。</p>
        )}

        {state.inventory.length > 0 && (
          <button onClick={() => store.clearInventory()} className="text-xs font-semibold text-slate-400">
            すべて消去
          </button>
        )}

        {fridgeMsg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">{fridgeMsg}</p>}
      </Card>

      {/* AI献立 */}
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">今日の献立（夕食）</h2>
          <Badge color="#0f766e">栄養バランス対応</Badge>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">今日の気分</span>
            <button
              type="button"
              onClick={() => setMoodModal(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-600"
            >
              <PlusIcon width={15} height={15} /> 気分を追加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {moodOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMood(value)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${mood === value ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-600">提案してほしいもの</span>
          <div className="grid grid-cols-4 gap-2">
            {COURSE_OPTIONS.map((option) => {
              const selected = courses.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setCourses((current) =>
                      selected ? (current.length > 1 ? current.filter((course) => course !== option.value) : current) : [...current, option.value],
                    )
                  }
                  className={`min-h-11 rounded-lg text-sm font-bold ${selected ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-600">中心料理の調理法</span>
          <div className="flex flex-wrap gap-2">
            {COOKING_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setCookingMethod(method)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${cookingMethod === method ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {method}
              </button>
            ))}
          </div>
          {cookingMethod === 'おまかせ' && <p className="mt-1.5 text-xs text-slate-400">直近の調理法を避け、焼く・煮る・蒸すなどから変化をつけます。</p>}
        </div>

        <Button className="w-full" onClick={suggest} disabled={loading || courses.length === 0}>
          {loading ? <Spinner /> : <SparkleIcon width={18} height={18} />}
          {mood === 'おまかせ' ? '栄養士AIに献立を提案してもらう' : `「${mood}」の献立を提案してもらう`}
        </Button>

        {meal?.dinner && !suggestion && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-red-500">
              <MealIcon width={22} height={22} />
            </div>
            <div className="flex-1">
              {meal.dinnerMood && <p className="mb-1 text-xs font-bold text-red-500">{meal.dinnerMood}</p>}
              {meal.dinnerCookingMethod && <Badge color="#d97706">{meal.dinnerCookingMethod}</Badge>}
              {meal.dinnerDishes?.length ? (
                <div className="space-y-1">
                  {meal.dinnerDishes.map((dish) => (
                    <div key={`${dish.course}-${dish.name}`} className="flex gap-2 text-sm">
                      <span className="w-10 shrink-0 font-bold text-slate-400">{courseLabel(dish.course)}</span>
                      <span className="font-bold text-slate-800">{dish.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-bold text-slate-800">{meal.dinner}</p>
              )}
              {meal.note && <p className="text-xs text-slate-500">{meal.note}</p>}
              {meal.nutritionNote && <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs font-semibold text-teal-700">栄養士メモ: {meal.nutritionNote}</p>}
            </div>
            <button
              onClick={() =>
                store.upsertMeal({
                  ...meal,
                  dinner: undefined,
                  dinnerDishes: undefined,
                  dinnerMood: undefined,
                  dinnerCookingMethod: undefined,
                  nutritionNote: undefined,
                  note: undefined,
                })
              }
              className="text-slate-300 active:text-red-500"
            >
              <TrashIcon width={18} height={18} />
            </button>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {suggestion && (
          <div className="animate-pop space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            {usedDemo && <Badge color="#d97706">デモ提案</Badge>}
            <div className="flex items-center gap-2">
              <Badge color="#d97706">{suggestion.cookingMethod}</Badge>
              <span className="text-xs font-semibold text-slate-500">{suggestion.servings}</span>
            </div>
            <div>
              <div className="space-y-1.5">
                {suggestion.dishes.map((dish) => (
                  <div key={`${dish.course}-${dish.name}`} className="flex items-baseline gap-2">
                    <Badge color="#0f766e">{courseLabel(dish.course)}</Badge>
                    <p className="font-extrabold text-slate-800">{dish.name}</p>
                  </div>
                ))}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">{suggestion.reason}</p>
            </div>
            <div className="rounded-lg bg-teal-50 p-3">
              <p className="text-xs font-bold text-teal-700">栄養士からのアドバイス</p>
              <p className="mt-1 text-sm text-teal-900">{suggestion.nutritionAdvice}</p>
            </div>
            {suggestion.ingredients.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400">材料</p>
                <p className="text-sm text-slate-600">{suggestion.ingredients.join('、')}</p>
              </div>
            )}
            <div className="rounded-lg bg-white/80 p-3">
              <p className="text-sm font-bold text-slate-700">{suggestion.recipeTitle}の作り方</p>
              <p className="mt-1 text-xs text-slate-500">{suggestion.recipeIngredients.join('、')}</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-700">
                {suggestion.steps.map((step, index) => <li key={index}>{step}</li>)}
              </ol>
              <Button
                variant="soft"
                className="mt-3 w-full"
                onClick={saveSuggestedRecipe}
                disabled={state.recipes.some((recipe) => recipe.title.trim().toLowerCase() === suggestion.recipeTitle.trim().toLowerCase())}
              >
                {state.recipes.some((recipe) => recipe.title.trim().toLowerCase() === suggestion.recipeTitle.trim().toLowerCase()) ? (
                  <><CheckIcon width={17} height={17} /> 保存済み</>
                ) : (
                  <><PlusIcon width={17} height={17} /> 保存レシピに追加</>
                )}
              </Button>
              {recipeMsg && <p className="mt-2 text-center text-xs font-semibold text-brand-700">{recipeMsg}</p>}
            </div>
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
            気分と料理区分を選ぶと、給食や最近の献立を踏まえて栄養バランスも提案します。
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
                        onClick={async () => {
                          if (await confirm({ title: 'レシピを削除', message: `「${r.title}」を削除しますか？`, danger: true })) {
                            store.removeRecipe(r.id)
                          }
                        }}
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

      <Modal open={moodModal} onClose={() => setMoodModal(false)} title="気分を追加">
        <div className="space-y-4">
          <Field label="気分の名前" hint="例: こってり、魚が食べたい、子ども向け">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={newMood}
                onChange={(e) => setNewMood(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveMood()}
                placeholder="気分を入力"
                maxLength={20}
                autoFocus
              />
              <Button
                aria-label="気分を追加"
                disabled={!normalizedNewMood || moodAlreadyExists}
                onClick={saveMood}
              >
                <PlusIcon width={18} height={18} />
              </Button>
            </div>
            {normalizedNewMood && moodAlreadyExists && <p className="mt-1 text-xs font-semibold text-amber-600">同じ気分が登録済みです。</p>}
          </Field>
          {state.customMealMoods.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-600">追加した気分</p>
              <div className="space-y-2">
                {state.customMealMoods.map((value) => (
                  <div key={value} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-700">{value}</span>
                    <button
                      type="button"
                      aria-label={`${value}を削除`}
                      onClick={() => {
                        store.removeMealMood(value)
                        if (mood === value) setMood('おまかせ')
                      }}
                      className="p-1 text-slate-400 active:text-red-500"
                    >
                      <TrashIcon width={17} height={17} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={!!lunchSheetView} onClose={() => setLunchSheetView(null)} title={lunchSheetView?.title}>
        {lunchSheetView && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {lunchSheetView.startDate && lunchSheetView.endDate
                ? `${formatJpDate(lunchSheetView.startDate)}〜${formatJpDate(lunchSheetView.endDate)}・${lunchSheetView.itemCount}日分`
                : `${lunchSheetView.itemCount}日分`}
            </p>
            {lunchSheetView.images.length ? (
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                {lunchSheetView.images.map((image, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setLunchLightbox(image)}
                    className="relative w-full shrink-0 snap-center"
                  >
                    <img src={image} alt={`${lunchSheetView.title} ${index + 1}ページ`} className="max-h-[65vh] w-full rounded-xl object-contain ring-1 ring-slate-200" />
                    <span className="absolute left-2 top-2 rounded-full bg-slate-900/60 px-2 py-1 text-xs font-bold text-white">
                      {index + 1}/{lunchSheetView.images.length}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">画像を同期しています。</p>
            )}
            <p className="text-center text-xs text-slate-400">左右スワイプでページ切替・タップで拡大</p>
            {lunchSheetView.images.length > 0 && (
              <Button
                variant="soft"
                className="w-full"
                disabled={savingLunchImages}
                onClick={async () => {
                  setSavingLunchImages(true)
                  try {
                    await saveImagesToDevice(lunchSheetView.images, `smartpita-lunch-${lunchSheetView.id}`)
                  } finally {
                    setSavingLunchImages(false)
                  }
                }}
              >
                <DownloadIcon width={18} height={18} />
                {savingLunchImages ? '保存中…' : `献立表をまとめて保存（${lunchSheetView.images.length}枚）`}
              </Button>
            )}
          </div>
        )}
      </Modal>

      <ImageLightbox src={lunchLightbox} onClose={() => setLunchLightbox(null)} />
    </div>
  )
}
