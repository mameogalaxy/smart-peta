import type { DocCategory, Settings } from '../types'
import { splitDataUrl } from './util'
import { recordUsage } from './usage'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiError extends Error {}

interface Part {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GenerateOptions {
  /** 構造化出力用の JSON スキーマ */
  schema?: Record<string, unknown>
  temperature?: number
}

/** Gemini generateContent への低レベル呼び出し */
async function generate(
  parts: Part[],
  settings: Settings,
  opts: GenerateOptions = {},
): Promise<string> {
  if (!settings.geminiApiKey) {
    throw new GeminiError('NO_KEY')
  }
  const model = settings.geminiModel || 'gemini-flash-latest'
  const url = `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
  }
  if (opts.schema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = opts.schema
  }

  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig,
  })

  // 503(過負荷)/429/500 は一時的なので指数バックオフで再試行する
  const backoffs = [700, 1500, 3000]
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch {
      throw new GeminiError('ネットワークエラー: Gemini に接続できませんでした。')
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
    // 一時的エラー → リトライ
    if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt < backoffs.length) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]))
      continue
    }
    if (res.status === 503) {
      throw new GeminiError('Geminiが混雑しています(503)。無料枠で時々起こります。少し待ってもう一度お試しください。')
    }
    if (res.status === 429) {
      throw new GeminiError('無料枠のレート上限に達しました。1分ほど待って再試行してください。')
    }
    throw new GeminiError(`Gemini エラー (${res.status})`)
  }
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
  /** 抽出した予定（提出期限・行事など） */
  events: { title: string; date: string; time?: string; note?: string }[]
  /** レシピの場合のみ */
  recipe?: { ingredients: string[]; steps: string[]; servings?: string }
}

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    category: { type: 'string', enum: ['school', 'garbage', 'recipe', 'utility', 'manual', 'work', 'other'] },
    summary: { type: 'string' },
    text: { type: 'string' },
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
  required: ['title', 'category', 'summary', 'text', 'events'],
}

/**
 * 書類画像を Gemini で解析（OCR + 自動分類 + 予定抽出 + レシピ抽出）。
 */
export async function scanDocument(imageDataUrl: string, settings: Settings, today: string): Promise<ScanResult> {
  const { mime, base64 } = splitDataUrl(imageDataUrl)
  const prompt = `You are a household paper-organizing assistant. Analyze a photo of a paper often stuck on a fridge (school handout, garbage-collection calendar, recipe clipping, or other notice). Today is ${today}.
Respond with JSON only. ALL text values must be in Japanese.
1. OCR all text in the image into "text" (Japanese).
2. "category": one of school / garbage / recipe / utility(電気・ガス・水道・光熱費の請求や検針) / manual(取扱説明書・保証書) / work(仕事・業務関連) / other.
3. "title": short descriptive headline. "summary": 1-2 sentence summary.
4. "events": date-bearing items (deadlines, events). "date" as YYYY-MM-DD (if year missing, infer the nearest upcoming year).
5. Only if it is a recipe, fill "recipe" with ingredients, steps, servings.`

  const raw = await generate(
    [
      { text: prompt },
      { inline_data: { mime_type: mime, data: base64 } },
    ],
    settings,
    { schema: SCAN_SCHEMA, temperature: 0.2 },
  )
  return parseJson<ScanResult>(raw)
}

/**
 * 画像ではなく「貼り付けたテキスト」を解析して分類・要約・予定抽出を行う（画像トークン不要で安価）。
 */
export async function analyzeDocumentText(text: string, settings: Settings, today: string): Promise<ScanResult> {
  const prompt = `You organize household documents. Below is text the user pasted from a paper (e.g., copied via phone text recognition). Today is ${today}.
Respond with JSON only. ALL text values must be in Japanese. Keep the original text in "text".
1. "category": one of school / garbage / recipe / utility(電気・ガス・水道・光熱費) / manual(取扱説明書・保証書) / work(仕事) / other.
2. "title": short headline. "summary": 1-2 sentence summary.
3. "events": date-bearing items as { title, date(YYYY-MM-DD), time?, note? } (infer nearest upcoming year if missing).
4. Only if a recipe, fill "recipe".

PASTED TEXT:
${text}`
  const raw = await generate([{ text: prompt }], settings, { schema: SCAN_SCHEMA, temperature: 0.2 })
  const r = parseJson<ScanResult>(raw)
  if (!r.text) r.text = text
  return r
}

// ---- 献立生成 ----
export interface MealSuggestion {
  dinner: string
  reason: string
  recipeTitle?: string
  ingredients: string[]
}

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    dinner: { type: 'string' },
    reason: { type: 'string' },
    recipeTitle: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
  },
  required: ['dinner', 'reason', 'ingredients'],
}

export interface MealContext {
  date: string
  schoolLunch?: string
  recentDinners: string[]
  availableRecipes: { title: string; ingredients: string[] }[]
  /** 冷蔵庫にある食材 */
  fridgeItems: string[]
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

  const prompt = `You are a household meal planner. Suggest ONE dinner for ${ctx.date}. Respond in JSON only, with all text values in Japanese.
Conditions (by priority):
1. Use the fridge ingredients as much as possible to minimize extra shopping. Fridge: [${ctx.fridgeItems.join(', ') || 'unknown'}].
2. Avoid overlapping the main dish/ingredients with today's school lunch: "${ctx.schoolLunch || 'unknown'}".
3. Avoid repeating recent dinners: [${ctx.recentDinners.join(' / ') || 'none'}].
4. Prefer the saved recipes below; otherwise suggest a common Japanese home dish.
Saved recipes:
${recipeList}

Return: "dinner" (dish name), "reason" (1-2 sentences considering fridge/lunch/recent dinners), "recipeTitle" (saved recipe name if used), "ingredients" (array of all ingredients needed to cook it). JSON only.`

  const raw = await generate([{ text: prompt }], settings, { schema: MEAL_SCHEMA, temperature: 0.8 })
  return parseJson<MealSuggestion>(raw)
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

/** 冷蔵庫の中（食材）の写真から、写っている食材を判定して列挙する。 */
export async function scanFridge(imageDataUrl: string, settings: Settings): Promise<FridgeScanResult> {
  const { mime, base64 } = splitDataUrl(imageDataUrl)
  const prompt = `This is a photo of the inside of a fridge (or food items). List the foods you can see. Respond with JSON only; every item must be in Japanese.
- Use common names (e.g., 卵, 牛乳, にんじん, 豆腐, キャベツ, 鶏肉).
- Only clearly identifiable items; for condiments include only major ones. Merge duplicates.
Return "items" as a Japanese string array.`
  const raw = await generate(
    [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }],
    settings,
    { schema: FRIDGE_SCHEMA, temperature: 0.2 },
  )
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
 * 学校給食の献立表（月間カレンダー形式が多い）を解析し、日付ごとのメニューを抽出する。
 */
export async function scanLunchMenu(imageDataUrl: string, settings: Settings, today: string): Promise<LunchMenuResult> {
  const { mime, base64 } = splitDataUrl(imageDataUrl)
  const prompt = `You read school lunch menu tables (often a monthly calendar). Today is ${today}. Respond with JSON only, all text values in Japanese.
1. Read each date's lunch menu.
2. "items": list of { date: "YYYY-MM-DD", menu: "main dish/staple/soup, comma-separated, concise (Japanese)" } in date order.
3. Prefer the year/month printed on the sheet; otherwise infer from today (${today}).
4. Exclude weekends and "no lunch" days.`

  const raw = await generate(
    [
      { text: prompt },
      { inline_data: { mime_type: mime, data: base64 } },
    ],
    settings,
    { schema: LUNCH_SCHEMA, temperature: 0.1 },
  )
  return parseJson<LunchMenuResult>(raw)
}

export function hasApiKey(settings: Settings): boolean {
  return Boolean(settings.geminiApiKey)
}
