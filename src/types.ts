// ---- ドメインの型定義 ----

/** 書類の自動分類カテゴリ */
export type DocCategory = 'school' | 'garbage' | 'recipe' | 'utility' | 'manual' | 'work' | 'other'

export const DOC_CATEGORIES: { id: DocCategory; label: string; color: string }[] = [
  { id: 'school', label: '学校', color: '#f59e0b' },
  { id: 'garbage', label: 'ゴミの日', color: '#10b981' },
  { id: 'recipe', label: 'レシピ', color: '#ef4444' },
  { id: 'utility', label: '光熱費', color: '#0ea5e9' },
  { id: 'manual', label: '説明書', color: '#8b5cf6' },
  { id: 'work', label: '仕事', color: '#475569' },
  { id: 'other', label: 'その他', color: '#6366f1' },
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
  /** 通知の何分前か（.ics追加時に使用）。未設定は10分前 */
  remindMinutes?: number
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
  /** アバターの色（頭文字を表示する円の背景色） */
  color: string
}

/** 家族アバターに使う色パレット */
export const MEMBER_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981', '#6366f1']

/** 冷蔵庫の中身（在庫）の1項目 */
export interface InventoryItem {
  id: string
  name: string
  createdAt: number
}

export interface Settings {
  /** 2つ目のAPIキー（予備/有料）。一時エラー時に自動フォールバック。 */
  geminiApiKey2?: string
  /** 簡易・低出力タスク用の軽量モデル（コスパ重視） */
  geminiModelLight?: string

  /** Gemini APIキー（端末ローカルにのみ保存） */
  geminiApiKey: string
  /** 使用するGeminiモデル（2026 無料枠） */
  geminiModel: string
  /** QRコードが指す公開URLのベース（家族が読み取るURL） */
  shareBaseUrl: string
  householdName: string
  /** 円換算の単価（100万トークンあたり・有料換算の目安） */
  yenInPerM: number
  yenOutPerM: number
}

export interface AppState {
  docs: DocItem[]
  events: CalendarEvent[]
  recipes: Recipe[]
  shopping: ShoppingItem[]
  meals: MealPlan[]
  /** 冷蔵庫の中身（在庫） */
  inventory: InventoryItem[]
  family: FamilyMember[]
  settings: Settings
}
