import { DOC_CATEGORIES, type DocCategory, type DocCategoryDefinition, type FamilyMember, type MealCourse, type MealDish, type Settings } from '../types'
import { splitDataUrl } from './util'
import { recordUsage } from './usage'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiError extends Error {
  /** 一時的エラー（503/429/500/ネットワーク）。別キーへのフォールバック対象。 */
  transient = false
}

interface Part {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GenerateOptions {
  /** 構造化出力用の JSON スキーマ */
  schema?: Record<string, unknown>
  temperature?: number
  /** 簡易・低出力タスクは軽量モデルを使う（コスパ重視） */
  light?: boolean
}

function transientErr(message: string): GeminiError {
  const e = new GeminiError(message)
  e.transient = true
  return e
}

/** 1つのキー・モデルで呼び出す（503等は数回リトライ） */
async function callModel(
  key: string,
  model: string,
  body: string,
): Promise<string> {
  const url = `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`
  const backoffs = [700, 1500]
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    } catch {
      throw transientErr('ネットワークエラー: Gemini に接続できませんでした。')
    }

    if (res.ok) {
      const json = await res.json()
      const um = json?.usageMetadata
      if (um) recordUsage(um.promptTokenCount ?? 0, um.candidatesTokenCount ?? 0)
      const text: string | undefined =
        json?.candidates?.[0]?.content?.parts?.map((p: Part) => p.text ?? '').join('') ?? undefined
      if (!text) throw new GeminiError('Gemini から有効な応答が得られませんでした。')
      return text
    }

    const errBody = await res.text().catch(() => '')
    if (res.status === 400 && /API key not valid/i.test(errBody)) {
      throw new GeminiError('APIキーが無効です。設定を確認してください。')
    }
    if (res.status === 404 || (res.status === 400 && /not found|not supported/i.test(errBody))) {
      throw new GeminiError(`モデル「${model}」が利用できません(${res.status})。設定のモデル名をご確認ください。`)
    }
    if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt < backoffs.length) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]))
      continue
    }
    if (res.status === 503) throw transientErr('Geminiが混雑しています(503)。')
    if (res.status === 429) throw transientErr('無料枠のレート上限に達しました(429)。')
    if (res.status === 500) throw transientErr('Geminiサーバーエラー(500)。')
    throw new GeminiError(`Gemini エラー (${res.status})`)
  }
}

/**
 * Gemini 呼び出し（低レベル）。
 * - キーは「無料(primary)」→ 一時エラーなら「有料/予備(secondary)」へ自動フォールバック。
 * - opts.light で軽量モデル（コスパ重視）に切替。
 */
async function generate(parts: Part[], settings: Settings, opts: GenerateOptions = {}): Promise<string> {
  const keys = [settings.geminiApiKey, settings.geminiApiKey2].map((k) => (k || '').trim()).filter(Boolean)
  if (!keys.length) throw new GeminiError('NO_KEY')

  const model = opts.light
    ? settings.geminiModelLight || settings.geminiModel || 'gemini-flash-latest'
    : settings.geminiModel || 'gemini-flash-latest'

  const generationConfig: Record<string, unknown> = { temperature: opts.temperature ?? 0.4 }
  if (opts.schema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = opts.schema
  }
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig })

  let lastErr: unknown
  for (let ki = 0; ki < keys.length; ki++) {
    try {
      return await callModel(keys[ki], model, body)
    } catch (e) {
      lastErr = e
      // 一時エラーで、まだ別のキーがあるならフォールバック
      if (e instanceof GeminiError && e.transient && ki < keys.length - 1) continue
      throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new GeminiError('Gemini エラー')
}

function parseJson<T>(raw: string): T {
  // ```json フェンスが付く場合に備えて剥がす
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  return JSON.parse(cleaned) as T
}

// ---- スキャン結果 ----
export interface ScanResult {
  title: string
  category: DocCategory
  summary: string
  text: string
  /** AIが文面から判定した対象メンバー。空配列は家族全員 */
  audienceIds?: string[]
  /** 抽出した予定（提出期限・行事など） */
  events: { title: string; date: string; time?: string; note?: string }[]
  /** レシピの場合のみ */
  recipe?: { ingredients: string[]; steps: string[]; servings?: string }
}

function scanSchema(categories: DocCategoryDefinition[]) {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      category: { type: 'string', enum: categories.map((c) => c.id) },
      summary: { type: 'string' },
      text: { type: 'string' },
      audienceIds: { type: 'array', items: { type: 'string' } },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            date: { type: 'string' },
            time: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['title', 'date'],
        },
      },
      recipe: {
        type: 'object',
        properties: {
          ingredients: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          servings: { type: 'string' },
        },
      },
    },
    required: ['title', 'category', 'summary', 'text', 'audienceIds', 'events'],
  }
}

function categoryPrompt(categories: DocCategoryDefinition[]): string {
  return JSON.stringify(categories.map(({ id, label }) => ({ id, label })))
}

function normalizeScanResult(
  result: ScanResult,
  categories: DocCategoryDefinition[],
  family: FamilyMember[],
): ScanResult {
  const memberIds = new Set(family.map((member) => member.id))
  return {
    ...result,
    category: categories.some((c) => c.id === result.category) ? result.category : 'other',
    audienceIds: [...new Set((result.audienceIds ?? []).filter((id) => memberIds.has(id)))],
  }
}

/**
 * 書類画像を Gemini で解析（OCR + 自動分類 + 予定抽出 + レシピ抽出）。
 */
export async function scanDocument(
  images: string | string[],
  settings: Settings,
  today: string,
  instruction?: string,
  categories: DocCategoryDefinition[] = DOC_CATEGORIES,
  family: FamilyMember[] = [],
): Promise<ScanResult> {
  const list = Array.isArray(images) ? images : [images]
  const multi = list.length > 1
  const prompt = `You are a household paper-organizing assistant. Analyze ${multi ? `${list.length} files (photos or PDF pages) that are pages of ONE document (or related printouts). Combine them` : 'a file (photo or PDF) of a document'} often stuck on a fridge (school handout, garbage-collection calendar, recipe clipping, or other notice). Today is ${today}.
Respond with JSON only. ALL text values must be in Japanese.
1. OCR all text${multi ? ' from every page, in order,' : ''} into "text" (Japanese).
2. "category": choose exactly one ID from: ${categoryPrompt(categories)}.
3. "audienceIds": choose member IDs only when the document clearly names or targets them. Use [] when it is for everyone or cannot be determined. Members: ${JSON.stringify(family.map(({ id, name }) => ({ id, name })))}.
4. "title": short descriptive headline. "summary": 1-2 sentence summary covering all pages.
5. "events": date-bearing items (deadlines, events) from any page. "date" as YYYY-MM-DD (if year missing, infer the nearest upcoming year).
6. Only if it is a recipe, fill "recipe" with ingredients, steps, servings.${
    instruction ? `\n7. Also follow this user instruction: ${instruction}` : ''
  }`

  const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [{ text: prompt }]
  for (const img of list) {
    const { mime, base64 } = splitDataUrl(img)
    parts.push({ inline_data: { mime_type: mime, data: base64 } })
  }

  const raw = await generate(parts, settings, { schema: scanSchema(categories), temperature: 0.2 })
  return normalizeScanResult(parseJson<ScanResult>(raw), categories, family)
}

/**
 * 画像ではなく「貼り付けたテキスト」を解析して分類・要約・予定抽出を行う（画像トークン不要で安価）。
 */
export async function analyzeDocumentText(
  text: string,
  settings: Settings,
  today: string,
  categories: DocCategoryDefinition[] = DOC_CATEGORIES,
  family: FamilyMember[] = [],
): Promise<ScanResult> {
  const prompt = `You organize household documents. Below is text the user pasted from a paper (e.g., copied via phone text recognition). Today is ${today}.
Respond with JSON only. ALL text values must be in Japanese. Keep the original text in "text".
1. "category": choose exactly one ID from: ${categoryPrompt(categories)}.
2. "audienceIds": choose member IDs only when the text clearly names or targets them. Use [] for everyone or unknown. Members: ${JSON.stringify(family.map(({ id, name }) => ({ id, name })))}.
3. "title": short headline. "summary": 1-2 sentence summary.
4. "events": date-bearing items as { title, date(YYYY-MM-DD), time?, note? } (infer nearest upcoming year if missing).
5. Only if a recipe, fill "recipe".

PASTED TEXT:
${text}`
  const raw = await generate([{ text: prompt }], settings, { schema: scanSchema(categories), temperature: 0.2, light: true })
  const r = normalizeScanResult(parseJson<ScanResult>(raw), categories, family)
  if (!r.text) r.text = text
  return r
}

// ---- 献立生成 ----
export interface MealSuggestion {
  dinner: string
  dishes: MealDish[]
  reason: string
  nutritionAdvice: string
  cookingMethod: string
  recipeTitle: string
  recipeIngredients: string[]
  steps: string[]
  servings: string
  ingredients: string[]
}

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    dinner: { type: 'string' },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          course: { type: 'string', enum: ['main', 'staple', 'side', 'soup'] },
          name: { type: 'string' },
        },
        required: ['course', 'name'],
      },
    },
    reason: { type: 'string' },
    nutritionAdvice: { type: 'string' },
    cookingMethod: { type: 'string' },
    recipeTitle: { type: 'string' },
    recipeIngredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    servings: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
  },
  required: ['dinner', 'dishes', 'reason', 'nutritionAdvice', 'cookingMethod', 'recipeTitle', 'recipeIngredients', 'steps', 'servings', 'ingredients'],
}

export interface MealContext {
  date: string
  schoolLunch?: string
  recentDinners: string[]
  availableRecipes: { title: string; ingredients: string[] }[]
  /** 冷蔵庫にある食材 */
  fridgeItems: string[]
  /** 食べたい雰囲気・気分 */
  mood?: string
  /** 提案してほしい料理区分 */
  courses: MealCourse[]
  /** 希望する中心料理の調理法。未設定はおまかせ */
  cookingMethod?: string
  /** 直近に採用した主菜の調理法 */
  recentCookingMethods: string[]
}

/**
 * 今日の献立(夕食)を提案。
 * - 学校給食と主菜・食材が被らない
 * - 冷蔵庫にある食材を活かす（買い足しを最小限に）
 * - 最近の夕食と重複しない
 */
export async function suggestDinner(ctx: MealContext, settings: Settings): Promise<MealSuggestion> {
  const recipeList = ctx.availableRecipes.length
    ? ctx.availableRecipes.map((r) => `・${r.title}（材料: ${r.ingredients.join('、')}）`).join('\n')
    : '（保存レシピなし）'

  const courseLabels: Record<MealCourse, string> = { main: '主菜', staple: '主食', side: '副菜', soup: '汁物' }
  const requestedCourses = ctx.courses.length ? ctx.courses : ['main' as const]
  const prompt = `You are both a registered dietitian and a practical household meal planner. Suggest a dinner menu for ${ctx.date}. Respond in JSON only, with all text values in Japanese.
Conditions (by priority):
1. Match the requested mood: "${ctx.mood || 'おまかせ'}".
2. Return exactly one dish for each requested course, and no unrequested courses. Requested courses: [${requestedCourses.map((course) => `${course}:${courseLabels[course]}`).join(', ')}].
3. Cooking method for the main dish, or the most substantial requested dish if no main dish is requested: ${ctx.cookingMethod ? `use "${ctx.cookingMethod}"` : `choose a method different from recent methods [${ctx.recentCookingMethods.join(' / ') || 'none'}]`}. Rotate broadly among grilling, simmering, steaming, frying, stir-frying, oven cooking, dressing/mixing, and no-cook methods. Do NOT default to stir-frying.
4. Use the fridge ingredients as much as possible to minimize extra shopping. Fridge: [${ctx.fridgeItems.join(', ') || 'unknown'}].
5. The school lunch on this exact date is "${ctx.schoolLunch || 'unknown'}". Do not repeat its named dishes, main protein, dominant ingredients, or a very similar flavor/cooking style at dinner.
6. Avoid repeating recent dinners: [${ctx.recentDinners.join(' / ') || 'none'}].
7. Prefer the saved recipes below; otherwise suggest common Japanese home dishes.
8. As a dietitian, assess protein, vegetables, carbohydrates, salt, and overall balance across the requested courses. If some courses are not requested, explain one concise optional addition that would improve balance.
Saved recipes:
${recipeList}

Return: "dinner" (a short menu summary joining all proposed dish names), "dishes" (array of objects with "course" and "name"), "reason" (1-2 sentences considering mood/method/fridge/lunch/recent dinners), "nutritionAdvice" (1-2 concise sentences from a dietitian), "cookingMethod" (short Japanese label for the main dish method), "recipeTitle" (the main dish, or the most substantial proposed dish if main is not requested), "recipeIngredients" (ingredients with quantities for that recipe only), "steps" (3-6 practical cooking steps for that recipe), "servings" (for example "2人分"), "ingredients" (deduplicated array of all ingredients needed for the entire menu). JSON only.`

  const raw = await generate([{ text: prompt }], settings, { schema: MEAL_SCHEMA, temperature: 0.8, light: true })
  const result = parseJson<MealSuggestion>(raw)
  const proposed = new Map(
    result.dishes
      .filter((dish) => requestedCourses.includes(dish.course) && dish.name.trim())
      .map((dish) => [dish.course, { ...dish, name: dish.name.trim() }]),
  )
  result.dishes = requestedCourses.flatMap((course) => {
    const dish = proposed.get(course)
    return dish ? [dish] : []
  })
  if (!result.dishes.length && result.dinner.trim()) {
    result.dishes = [{ course: requestedCourses[0], name: result.dinner.trim() }]
  }
  return result
}

// ---- 冷蔵庫スキャン ----
export interface FridgeScanResult {
  items: string[]
}

const FRIDGE_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'string' } } },
  required: ['items'],
}

/** 冷蔵庫の中（食材）の写真から、写っている食材を判定して列挙する（複数枚対応）。 */
export async function scanFridge(images: string | string[], settings: Settings): Promise<FridgeScanResult> {
  const list = Array.isArray(images) ? images : [images]
  const prompt = `These are ${list.length > 1 ? `${list.length} photos` : 'a photo'} of the inside of a fridge (or food items). List ALL the foods you can see across ${list.length > 1 ? 'all photos' : 'the photo'}. Respond with JSON only; every item must be in Japanese.
- Use common names (e.g., 卵, 牛乳, にんじん, 豆腐, キャベツ, 鶏肉).
- Only clearly identifiable items; for condiments include only major ones. Merge duplicates across photos.
Return "items" as a Japanese string array.`
  const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [{ text: prompt }]
  for (const img of list) {
    const { mime, base64 } = splitDataUrl(img)
    parts.push({ inline_data: { mime_type: mime, data: base64 } })
  }
  const raw = await generate(parts, settings, { schema: FRIDGE_SCHEMA, temperature: 0.2, light: true })
  return parseJson<FridgeScanResult>(raw)
}

// ---- 給食献立表のスキャン ----
export interface LunchMenuResult {
  /** 日付ごとの給食メニュー */
  items: { date: string; menu: string }[]
}

const LUNCH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          menu: { type: 'string' },
        },
        required: ['date', 'menu'],
      },
    },
  },
  required: ['items'],
}

/**
 * 学校給食の献立表（月間カレンダー形式が多い）を解析し、日付ごとのメニューを抽出する（複数枚/PDF対応）。
 */
export async function scanLunchMenu(images: string | string[], settings: Settings, today: string): Promise<LunchMenuResult> {
  const list = Array.isArray(images) ? images : [images]
  const prompt = `You read school lunch menu tables (often a monthly calendar)${list.length > 1 ? `, given as ${list.length} images/pages` : ''}. Today is ${today}. Respond with JSON only, all text values in Japanese.
1. Read each date's lunch menu${list.length > 1 ? ' across all pages' : ''}.
2. "items": list of { date: "YYYY-MM-DD", menu: "main dish/staple/soup, comma-separated, concise (Japanese)" } in date order.
3. Prefer the year/month printed on the sheet; otherwise infer from today (${today}).
4. Read the entire printed month exhaustively, checking every calendar row and every weekday date. A normal monthly sheet may contain about 18-23 lunch days.
5. Exclude weekends, holidays, and "no lunch" days. Merge duplicate dates and do not invent unreadable menus.`

  const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [{ text: prompt }]
  for (const img of list) {
    const { mime, base64 } = splitDataUrl(img)
    parts.push({ inline_data: { mime_type: mime, data: base64 } })
  }
  const raw = await generate(parts, settings, { schema: LUNCH_SCHEMA, temperature: 0.1 })
  return parseJson<LunchMenuResult>(raw)
}

// ---- 画像から予定だけ抽出（全文OCR/要約/レシピはしないが、読み取り精度重視でメインモデルを使用） ----
export interface EventsResult {
  category: DocCategory
  events: { title: string; date: string; time?: string; note?: string }[]
}

const EVENTS_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['school', 'garbage', 'recipe', 'utility', 'manual', 'work', 'other'] },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['title', 'date'],
      },
    },
  },
  required: ['events'],
}

/** 画像/PDFから「予定（日付付き）」だけを抽出する（全文OCR/要約はしないが読み取りはメインモデルで強めに）。 */
export async function extractEventsFromImage(
  imageDataUrl: string,
  settings: Settings,
  today: string,
  instruction?: string,
): Promise<EventsResult> {
  const { mime, base64 } = splitDataUrl(imageDataUrl)
  const prompt = `Today is ${today}. From this file (a schedule, notice, screenshot, or PDF), carefully extract ALL date-bearing events. Do NOT transcribe all text, no summary, no OCR dump.
Return JSON only. All text in Japanese.
- "events": [{ title, date(YYYY-MM-DD; infer nearest upcoming year if missing), time?, note? }]
- "category": school/garbage/recipe/utility/manual/work/other${instruction ? `\n- Follow this instruction: ${instruction}` : ''}`
  const raw = await generate(
    [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }],
    settings,
    { schema: EVENTS_SCHEMA, temperature: 0.1 },
  )
  const r = parseJson<EventsResult>(raw)
  if (!r.category) r.category = 'other'
  return r
}

export function hasApiKey(settings: Settings): boolean {
  return Boolean(settings.geminiApiKey)
}
