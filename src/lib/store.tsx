import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppState,
  CalendarEvent,
  DocItem,
  FamilyMember,
  InventoryItem,
  MealPlan,
  Recipe,
  Settings,
  ShoppingItem,
} from '../types'
import { seedFamily } from './demo'
import { uid } from './util'

const STORAGE_KEY = 'smart-peta:v1'

/** 2026年時点の最新無料Flashを常に指す推奨モデル */
export const DEFAULT_MODEL = 'gemini-flash-latest'

/** 廃止予定の旧モデルIDは最新エイリアスへ移行する */
const DEPRECATED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
])

const defaultSettings: Settings = {
  geminiApiKey: '',
  geminiModel: DEFAULT_MODEL,
  shareBaseUrl: '',
  householdName: 'わが家',
  // 有料換算の目安（Gemini Flash想定・約¥150/$）。実際は無料枠なら¥0。
  yenInPerM: 45,
  yenOutPerM: 375,
}

function initialState(): AppState {
  return {
    docs: [],
    events: [],
    recipes: [],
    shopping: [],
    meals: [],
    inventory: [],
    family: seedFamily(),
    settings: { ...defaultSettings },
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = initialState()
    const settings = { ...base.settings, ...(parsed.settings ?? {}) }
    // 旧モデル/空欄は最新エイリアスへ移行
    if (!settings.geminiModel || DEPRECATED_MODELS.has(settings.geminiModel)) {
      settings.geminiModel = DEFAULT_MODEL
    }
    return {
      ...base,
      ...parsed,
      inventory: parsed.inventory ?? [],
      settings,
      family: parsed.family?.length ? parsed.family : base.family,
    }
  } catch {
    return initialState()
  }
}

interface StoreApi {
  state: AppState
  // 書類
  addDoc: (doc: DocItem) => void
  updateDoc: (id: string, patch: Partial<DocItem>) => void
  removeDoc: (id: string) => void
  // 予定
  addEvent: (e: CalendarEvent) => void
  addEvents: (es: CalendarEvent[]) => void
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void
  removeEvent: (id: string) => void
  // レシピ
  addRecipe: (r: Recipe) => void
  removeRecipe: (id: string) => void
  // 買い物
  addShopping: (items: ShoppingItem[]) => void
  toggleShopping: (id: string) => void
  removeShopping: (id: string) => void
  clearCheckedShopping: () => void
  // 献立
  upsertMeal: (m: MealPlan) => void
  removeMeal: (id: string) => void
  /** 給食献立表スキャン等から、日付ごとの給食を一括登録 */
  setSchoolLunches: (items: { date: string; menu: string }[]) => void
  /** 給食を削除（dateを渡せばその日、省略で全部） */
  clearSchoolLunches: (date?: string) => void
  // 冷蔵庫の中身
  addInventory: (items: InventoryItem[]) => void
  removeInventory: (id: string) => void
  clearInventory: () => void
  // 家族
  setFamily: (f: FamilyMember[]) => void
  // 設定
  updateSettings: (patch: Partial<Settings>) => void
  resetAll: () => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const first = useRef(true)

  // 永続化（初回ロードはスキップ）
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* 容量超過などは無視 */
    }
  }, [state])

  const api = useMemo<StoreApi>(() => {
    const patch = (fn: (s: AppState) => AppState) => setState(fn)
    return {
      state,
      addDoc: (doc) => patch((s) => ({ ...s, docs: [doc, ...s.docs] })),
      updateDoc: (id, p) => patch((s) => ({ ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
      removeDoc: (id) =>
        patch((s) => ({
          ...s,
          docs: s.docs.filter((d) => d.id !== id),
          events: s.events.filter((e) => e.docId !== id),
        })),
      addEvent: (e) => patch((s) => ({ ...s, events: [...s.events, e] })),
      addEvents: (es) => patch((s) => ({ ...s, events: [...s.events, ...es] })),
      updateEvent: (id, p) =>
        patch((s) => ({
          ...s,
          events: s.events.map((e) => (e.id === id ? { ...e, ...p } : e)),
        })),
      removeEvent: (id) => patch((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) })),
      addRecipe: (r) => patch((s) => ({ ...s, recipes: [r, ...s.recipes] })),
      removeRecipe: (id) => patch((s) => ({ ...s, recipes: s.recipes.filter((r) => r.id !== id) })),
      addShopping: (items) => patch((s) => ({ ...s, shopping: [...items, ...s.shopping] })),
      toggleShopping: (id) =>
        patch((s) => ({
          ...s,
          shopping: s.shopping.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
        })),
      removeShopping: (id) => patch((s) => ({ ...s, shopping: s.shopping.filter((i) => i.id !== id) })),
      clearCheckedShopping: () =>
        patch((s) => ({ ...s, shopping: s.shopping.filter((i) => !i.checked) })),
      upsertMeal: (m) =>
        patch((s) => {
          const exists = s.meals.some((x) => x.date === m.date)
          return {
            ...s,
            meals: exists ? s.meals.map((x) => (x.date === m.date ? m : x)) : [m, ...s.meals],
          }
        }),
      removeMeal: (id) => patch((s) => ({ ...s, meals: s.meals.filter((m) => m.id !== id) })),
      setSchoolLunches: (items) =>
        patch((s) => {
          const map = new Map(s.meals.map((m) => [m.date, m]))
          for (const it of items) {
            if (!it.date || !it.menu) continue
            const ex = map.get(it.date)
            if (ex) map.set(it.date, { ...ex, schoolLunch: it.menu })
            else map.set(it.date, { id: uid(), date: it.date, schoolLunch: it.menu, recipeIds: [], createdAt: Date.now() })
          }
          return { ...s, meals: [...map.values()] }
        }),
      clearSchoolLunches: (date) =>
        patch((s) => ({
          ...s,
          meals: s.meals.map((m) =>
            date ? (m.date === date ? { ...m, schoolLunch: undefined } : m) : { ...m, schoolLunch: undefined },
          ),
        })),
      addInventory: (items) =>
        patch((s) => {
          const existing = new Set(s.inventory.map((i) => i.name))
          const fresh = items.filter((i) => i.name && !existing.has(i.name))
          return { ...s, inventory: [...fresh, ...s.inventory] }
        }),
      removeInventory: (id) => patch((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== id) })),
      clearInventory: () => patch((s) => ({ ...s, inventory: [] })),
      setFamily: (f) => patch((s) => ({ ...s, family: f })),
      updateSettings: (p) => patch((s) => ({ ...s, settings: { ...s.settings, ...p } })),
      resetAll: () => {
        localStorage.removeItem(STORAGE_KEY)
        setState(initialState())
      },
    }
  }, [state])

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
