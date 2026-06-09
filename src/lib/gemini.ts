import type { DocCategory, Settings } from '../types'
import { splitDataUrl } from './util'

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
  const model = settings.geminiModel || 'gemini-2.5-flash'
  const url = `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
  }
  if (opts.schema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = opts.schema
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig,
      }),
    })
  } catch {
    throw new GeminiError('ネットワークエラー: Gemini に接続できませんでした。')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 400 && /API key not valid/i.test(body)) {
      throw new GeminiError('APIキーが無効です。設定を確認してください。')
    }
    if (res.status === 429) {
      throw new GeminiError('無料枠のレート上限に達しました。少し待って再試行してください。')
    }
    throw new GeminiError(`Gemini エラー (${res.status})`)
  }

  const json = await res.json()
  const text: string | undefined =
    json?.candidates?.[0]?.content?.parts?.map((p: Part) => p.text ?? '').join('') ?? undefined
  if (!text) throw new GeminiError('Gemini から有効な応答が得られませんでした。')
  return text
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
    category: { type: 'string', enum: ['school', 'garbage', 'recipe', 'other'] },
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
  const prompt = `あなたは家庭の書類整理アシスタントです。冷蔵庫に貼られがちな紙（学校のプリント、ゴミ収集カレンダー、レシピの切り抜き、その他のお知らせ）の写真を解析します。
今日の日付は ${today} です。次を行ってください:
1. 画像内の文字をOCRで読み取り text に全文を入れる（日本語）。
2. category を school(学校) / garbage(ゴミの日) / recipe(レシピ) / other のいずれかに分類。
3. title に内容が分かる短い見出し、summary に1〜2文の要約。
4. 提出期限・行事・イベントなど日付付き項目を events に列挙。date は YYYY-MM-DD 形式（年が無ければ今日以降で最も近い年を推定）。
5. レシピの場合のみ recipe に材料(ingredients)と手順(steps)、分量(servings)を入れる。
JSON のみを返してください。`

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
}

/**
 * 今日の献立(夕食)を提案。学校給食と被らず、最近の夕食とも重複しないよう配慮。
 */
export async function suggestDinner(ctx: MealContext, settings: Settings): Promise<MealSuggestion> {
  const recipeList = ctx.availableRecipes.length
    ? ctx.availableRecipes.map((r) => `・${r.title}（材料: ${r.ingredients.join('、')}）`).join('\n')
    : '（保存レシピなし）'

  const prompt = `あなたは家庭の献立プランナーです。${ctx.date} の夕食を1つ提案してください。
条件:
- その日の学校給食「${ctx.schoolLunch || '不明'}」と主菜・主な食材が被らないようにする。
- 最近の夕食 [${ctx.recentDinners.join(' / ') || 'なし'}] と重複しないようにする。
- できれば下記の保存レシピを優先的に活用する。無ければ一般的な家庭料理を提案。
保存レシピ:
${recipeList}

dinner=献立名, reason=給食や直近の夕食を踏まえた提案理由(1文), recipeTitle=使った保存レシピ名(あれば), ingredients=買い物に必要な材料の配列。JSON のみ返す。`

  const raw = await generate([{ text: prompt }], settings, { schema: MEAL_SCHEMA, temperature: 0.8 })
  return parseJson<MealSuggestion>(raw)
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
  const prompt = `あなたは学校給食の献立表を読み取るアシスタントです。今日は ${today} です。
写真は1ヶ月分などの給食献立表（カレンダー形式が多い）です。次を行ってください:
1. 各日付の給食メニューを読み取る。
2. items に { date: "YYYY-MM-DD", menu: "主菜・主食・汁物などをカンマ区切りで簡潔に" } を日付順で列挙。
3. date の年・月は献立表の表記を優先し、無ければ今日(${today})を基準に推定する。
4. 土日や「給食なし」の日は含めない。
JSON のみを返してください。`

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
