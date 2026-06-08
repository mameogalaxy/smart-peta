// ---- ドメインの型定義 ----

/** 書類の自動分類カテゴリ */
export type DocCategory = 'school' | 'garbage' | 'recipe' | 'other'

export const DOC_CATEGORIES: { id: DocCategory; label: string; emoji: string; color: string }[] = [
  { id: 'school', label: '学校', emoji: '🏫', color: '#f59e0b' },
  { id: 'garbage', label: 'ゴミの日', emoji: '🗑️', color: '#10b981' },
  { id: 'recipe', label: 'レシピ', emoji: '🍳', color: '#ef4444' },
  { id: 'other', label: 'その他', emoji: '📄', color: '#6366f1' },
]

/** スキャンして取り込んだ書類 */
export interface DocItem {
  id: string
  title: string
  category: DocCategory
  /** AIが抽出した本文テキスト（OCR） */
  text: string
  /** AIの要約 */
  summary: string
  /** 画像（dataURL）。デモのためローカル保存 */
  image?: string
  createdAt: number
}

/** カレンダー予定（書類から自動抽出 or 手入力） */
export interface CalendarEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm 任意 */
  time?: string
  note?: string
  category: DocCategory
  /** 紐づく書類ID（あれば） */
  docId?: string
  /** 通知リマインダーを有効にするか */
  remind: boolean
  /** 担当の家族メンバーID */
  assignee?: string
  done: boolean
  createdAt: number
}

/** レシピ */
export interface Recipe {
  id: string
  title: string
  ingredients: string[]
  steps: string[]
  servings?: string
  tags: string[]
  image?: string
  createdAt: number
}

/** 買い物リストの1項目 */
export interface ShoppingItem {
  id: string
  name: string
  qty?: string
  checked: boolean
  /** 由来のレシピID（あれば） */
  fromRecipeId?: string
  addedBy?: string
  createdAt: number
}

/** 献立（1日分） */
export interface MealPlan {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** その日の学校給食メニュー（被り回避に使う） */
  schoolLunch?: string
  breakfast?: string
  lunch?: string
  dinner?: string
  /** 使用したレシピID */
  recipeIds: string[]
  note?: string
  createdAt: number
}

/** 家族メンバー */
export interface FamilyMember {
  id: string
  name: string
  emoji: string
}

export interface Settings {
  /** Gemini APIキー（端末ローカルにのみ保存） */
  geminiApiKey: string
  /** 使用するGeminiモデル（2026 無料枠） */
  geminiModel: string
  /** QRコードが指す公開URLのベース（家族が読み取るURL） */
  shareBaseUrl: string
  householdName: string
}

export interface AppState {
  docs: DocItem[]
  events: CalendarEvent[]
  recipes: Recipe[]
  shopping: ShoppingItem[]
  meals: MealPlan[]
  family: FamilyMember[]
  settings: Settings
}
