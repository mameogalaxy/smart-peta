// ---- ドメインの型定義 ----

/** 書類の自動分類カテゴリ */
export type DocCategory = string

export interface DocCategoryDefinition {
  id: DocCategory
  label: string
  color: string
  custom?: boolean
}

export const DOC_CATEGORIES: DocCategoryDefinition[] = [
  { id: 'school', label: '学校', color: '#f59e0b' },
  { id: 'garbage', label: 'ゴミの日', color: '#10b981' },
  { id: 'recipe', label: 'レシピ', color: '#ef4444' },
  { id: 'utility', label: '光熱費', color: '#0ea5e9' },
  { id: 'manual', label: '説明書', color: '#8b5cf6' },
  { id: 'work', label: '仕事', color: '#475569' },
  { id: 'other', label: 'その他', color: '#6366f1' },
]

export function allDocCategories(custom: DocCategoryDefinition[] = [], hiddenIds: string[] = []): DocCategoryDefinition[] {
  const builtInIds = new Set(DOC_CATEGORIES.map((c) => c.id))
  const hidden = new Set(hiddenIds)
  return [...DOC_CATEGORIES, ...custom.filter((c) => !builtInIds.has(c.id))].filter((c) => c.id === 'other' || !hidden.has(c.id))
}

export function findDocCategory(id: DocCategory, custom: DocCategoryDefinition[] = [], hiddenIds: string[] = []): DocCategoryDefinition {
  return allDocCategories(custom, hiddenIds).find((c) => c.id === id) ?? DOC_CATEGORIES.find((c) => c.id === 'other')!
}

/** スキャンして取り込んだ書類 */
export interface DocItem {
  id: string
  title: string
  category: DocCategory
  /** 利用者が入力・編集するメモ */
  note?: string
  /** 対象の家族メンバーID。未設定/空配列は家族全員 */
  audienceIds?: string[]
  /** AIが抽出した本文テキスト（OCR） */
  text: string
  /** AIの要約 */
  summary: string
  /** 代表画像（=images[0]）。一覧のサムネ用。dataURLでローカル保存 */
  image?: string
  /** 複数ページの画像（PDFはページごとにJPEG化）。詳細でスライド表示。ローカル保存 */
  images?: string[]
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
  /** くり返し登録した予定をまとめる識別子（一括削除に使用） */
  seriesId?: string
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
  /** 欲しいものリストの項目か（買い物リストと区別） */
  wish?: boolean
  /** 商品ページなどのURL（欲しいもの用・任意） */
  url?: string
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
  /** アバター写真（dataURL・任意）。あれば写真を優先表示 */
  photo?: string
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
  // ---- 家族クラウド共有（Firebase） ----
  /** Firebase Web config(JSON文字列)。空ならローカルのみ。 */
  firebaseConfig?: string
  /** 参加中の世帯ID（=招待コード）。未設定ならローカルのみ。 */
  householdId?: string
  /** 世帯の表示名 */
  householdName2?: string
  /** この端末の利用者名・色・写真（家族メンバー登録用） */
  memberName?: string
  memberColor?: string
  memberPhoto?: string
  /** この利用者の安定ID（家族リスト上の自分の識別） */
  memberId?: string
  /** APIキー・モデルを世帯（家族）に共有して、家族も使えるようにする */
  shareAiWithFamily?: boolean
  /** スキャンした写真を端末（写真フォルダ）にも保存する */
  saveScansToPhotos?: boolean
}

export interface AppState {
  docs: DocItem[]
  /** 家族で共有する追加書類カテゴリ */
  customDocCategories: DocCategoryDefinition[]
  /** 使用しない標準書類カテゴリID */
  hiddenDocCategoryIds: string[]
  events: CalendarEvent[]
  recipes: Recipe[]
  shopping: ShoppingItem[]
  meals: MealPlan[]
  /** 冷蔵庫の中身（在庫） */
  inventory: InventoryItem[]
  family: FamilyMember[]
  settings: Settings
}
