import {
  createContext,
  useCallback,
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
import { uid, compressForShare } from './util'
import {
  doc as fsDoc,
  collection as fsCollection,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore'
import { ensureAnonSignIn, getDb, initFirebase, parseFirebaseConfig, randomId } from './firebase'
import { DEFAULT_FIREBASE_CONFIG, HAS_DEFAULT_FIREBASE } from '../firebaseConfig'

const STORAGE_KEY = 'smart-peta:v1'

/** 設定の貼り付け config（あれば）→ 無ければ既定の共通 config を使う */
function resolveConfig(raw?: string): Record<string, unknown> | null {
  const fromSetting = parseFirebaseConfig(raw)
  if (fromSetting) return fromSetting
  return HAS_DEFAULT_FIREBASE ? (DEFAULT_FIREBASE_CONFIG as Record<string, unknown>) : null
}

/** クラウド同期する配列コレクション（画像は docs から除外して送る） */
const SYNCED = ['docs', 'events', 'shopping', 'recipes', 'meals', 'inventory', 'family'] as const
type SyncedKey = (typeof SYNCED)[number]

export type CloudStatus = 'off' | 'connecting' | 'on' | 'error'

function stripImages(col: SyncedKey, raw: unknown[]): unknown[] {
  if (col !== 'docs') return raw
  // 画像は items とは別（households/{hid}/data/img_{docId}）に同期するため、本文からは外す
  return (raw as DocItem[]).map(({ image: _img, images: _imgs, ...rest }) => rest)
}

/** 書類の画像リスト（代表+複数ページ）を1つにまとめる */
function docImageList(d: DocItem): string[] {
  if (d.images && d.images.length) return d.images
  return d.image ? [d.image] : []
}
/** 画像セットの簡易シグネチャ（変化検知用） */
function imgSig(list: string[]): string {
  return `${list.length}:${list.map((s) => s.length).join(',')}`
}

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
  geminiApiKey2: '',
  geminiModel: DEFAULT_MODEL,
  geminiModelLight: 'gemini-flash-lite-latest',
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
  /** くり返しで登録した同一シリーズの予定をまとめて削除 */
  removeEventSeries: (seriesId: string) => void
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
  /** 全データをJSON文字列で書き出す（バックアップ） */
  exportData: () => string
  /** バックアップJSONから復元する。成功でtrue */
  importData: (json: string) => boolean
  /** 実際にAI呼び出しで使う設定（自分のキーが無ければ家族共有キーを補完） */
  aiSettings: Settings
  // 家族クラウド共有
  cloud: { status: CloudStatus; error: string }
  createHousehold: (name: string) => Promise<string>
  joinHousehold: (code: string, configStr?: string) => Promise<void>
  leaveHousehold: () => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const first = useRef(true)
  const patch = useCallback((fn: (s: AppState) => AppState) => setState(fn), [])

  // ---- 家族クラウド共有 ----
  const [cloud, setCloud] = useState<{ status: CloudStatus; error: string }>({ status: 'off', error: '' })
  /** 直近に同期した各コレクションの内容（エコー防止用） */
  const lastSync = useRef<Record<string, string>>({})
  /** 参加直後、最初の受信でローカルの内容を世帯にマージする対象コレクション（データ消失防止） */
  const mergeCols = useRef<Set<string>>(new Set())
  /** クラウドから受信した書類画像（docId -> images）。ローカルに無い書類へ表示用に付与 */
  const remoteDocImages = useRef<Map<string, string[]>>(new Map())
  /** 各書類画像の最終同期シグネチャ（再送/エコー防止） */
  const imgPushed = useRef<Record<string, string>>({})
  /** 家族から共有されたAI設定（APIキー・モデル）。自分のキーが無いときの補完に使う。 */
  const [cloudAI, setCloudAI] = useState<Partial<Settings>>({})

  const applyRemote = useCallback((col: SyncedKey, items: unknown[]) => {
    // 参加直後の初回受信だけはローカルを世帯へマージ（既存の予定などが消えないように）
    const doMerge = mergeCols.current.has(col)
    if (doMerge) mergeCols.current.delete(col)
    // lastSync は「受信した世帯の内容」を記録。マージ時は state がそれと変わるので送信effectが発火→マージ結果をアップロード
    lastSync.current[col] = JSON.stringify(items)
    setState((s) => {
      if (col === 'docs') {
        const localById = new Map(s.docs.map((d) => [d.id, d]))
        const remote = (items as DocItem[]).map((d) => {
          const local = localById.get(d.id)
          const ri = remoteDocImages.current.get(d.id)
          const hasLocalImg = !!(local?.image || (local?.images && local.images.length))
          if (ri && !hasLocalImg) imgPushed.current[d.id] = imgSig(ri)
          return {
            ...d,
            image: local?.image ?? (hasLocalImg ? undefined : ri?.[0]),
            images: local?.images ?? (hasLocalImg ? undefined : ri && ri.length > 1 ? ri : undefined),
          }
        })
        if (doMerge) {
          const byId = new Map<string, DocItem>(remote.map((d) => [d.id, d]))
          for (const d of s.docs) if (!byId.has(d.id)) byId.set(d.id, d)
          return { ...s, docs: [...byId.values()] }
        }
        return { ...s, docs: remote }
      }
      if (doMerge) {
        const arr = items as { id?: string }[]
        const byId = new Map(arr.filter((x) => x && x.id != null).map((x) => [x.id, x]))
        for (const x of s[col] as { id?: string }[]) {
          if (x && x.id != null && !byId.has(x.id)) byId.set(x.id, x)
        }
        return { ...s, [col]: [...byId.values()] } as AppState
      }
      return { ...s, [col]: items } as AppState
    })
  }, [])

  const cfgStr = state.settings.firebaseConfig
  const hid = state.settings.householdId

  // 受信：世帯データを購読してローカルへ反映
  useEffect(() => {
    const cfg = resolveConfig(cfgStr)
    if (!cfg || !hid) {
      setCloud({ status: 'off', error: '' })
      setCloudAI({})
      remoteDocImages.current = new Map()
      imgPushed.current = {}
      return
    }
    let cancelled = false
    const unsubs: (() => void)[] = []
    setCloud({ status: 'connecting', error: '' })
    ;(async () => {
      try {
        initFirebase(cfg)
        await ensureAnonSignIn()
        if (cancelled) return
        for (const col of SYNCED) {
          const ref = fsDoc(getDb(), 'households', hid, 'data', col)
          const unsub = onSnapshot(
            ref,
            (snap) => {
              const items = (snap.exists() ? (snap.data() as { items?: unknown[] }).items : []) ?? []
              applyRemote(col, items as unknown[])
            },
            (err) => setCloud({ status: 'error', error: err.message }),
          )
          unsubs.push(unsub)
        }
        // 書類画像を購読（households/{hid}/data/img_{docId}）。ローカルに画像が無い書類へ付与
        const dataCol = fsCollection(getDb(), 'households', hid, 'data')
        unsubs.push(
          onSnapshot(
            dataCol,
            (snap) => {
              const imgs = new Map<string, string[]>()
              snap.forEach((docu) => {
                if (!docu.id.startsWith('img_')) return
                const a = (docu.data() as { images?: string[] }).images
                if (a && a.length) imgs.set(docu.id.slice(4), a)
              })
              remoteDocImages.current = imgs
              setState((s) => {
                let changed = false
                const docs = s.docs.map((d) => {
                  if (d.image || (d.images && d.images.length)) return d
                  const r = imgs.get(d.id)
                  if (!r || !r.length) return d
                  imgPushed.current[d.id] = imgSig(r)
                  changed = true
                  return { ...d, image: r[0], images: r.length > 1 ? r : undefined }
                })
                return changed ? { ...s, docs } : s
              })
            },
            () => {},
          ),
        )
        // 家族から共有されたAI設定（APIキー・モデル）を購読
        const cfgRef = fsDoc(getDb(), 'households', hid, 'data', 'config')
        unsubs.push(
          onSnapshot(
            cfgRef,
            (snap) => {
              const d = (snap.exists() ? (snap.data() as Partial<Settings>) : {}) ?? {}
              setCloudAI({
                geminiApiKey: d.geminiApiKey || '',
                geminiApiKey2: d.geminiApiKey2 || '',
                geminiModel: d.geminiModel || '',
                geminiModelLight: d.geminiModelLight || '',
              })
            },
            () => {},
          ),
        )
        if (!cancelled) setCloud({ status: 'on', error: '' })
      } catch (e) {
        if (!cancelled) setCloud({ status: 'error', error: e instanceof Error ? e.message : 'クラウド接続に失敗しました。' })
      }
    })()
    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
      lastSync.current = {}
      remoteDocImages.current = new Map()
      imgPushed.current = {}
      setCloudAI({})
    }
  }, [cfgStr, hid, applyRemote])

  // 送信：書類の画像を圧縮して世帯へ共有（data/img_{docId}）。本文(items)とは別管理
  useEffect(() => {
    if (cloud.status !== 'on' || !hid) return
    let cancelled = false
    ;(async () => {
      for (const d of state.docs) {
        const list = docImageList(d).filter((x) => !x.startsWith('data:application/pdf'))
        if (!list.length) continue
        const sig = imgSig(list)
        if (imgPushed.current[d.id] === sig) continue
        imgPushed.current[d.id] = sig
        try {
          const compressed = await Promise.all(list.map((x) => compressForShare(x)))
          if (cancelled) return
          await setDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${d.id}`), { images: compressed })
        } catch {
          // 1MB超過/オフライン等は共有をスキップ（本文は同期済み）
        }
      }
      // ローカルで削除された書類の画像はクラウドからも削除
      for (const id of Object.keys(imgPushed.current)) {
        if (!state.docs.some((d) => d.id === id)) {
          delete imgPushed.current[id]
          deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${id}`)).catch(() => {})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud.status, hid, state.docs])

  // 送信：APIキー・モデルを家族に共有（shareAiWithFamily が ON のときだけ書き込む）
  useEffect(() => {
    if (cloud.status !== 'on' || !hid) return
    if (!state.settings.shareAiWithFamily) return
    const cfg = {
      geminiApiKey: state.settings.geminiApiKey || '',
      geminiApiKey2: state.settings.geminiApiKey2 || '',
      geminiModel: state.settings.geminiModel || '',
      geminiModelLight: state.settings.geminiModelLight || '',
    }
    const ser = JSON.stringify(cfg)
    if (ser !== lastSync.current['__config']) {
      lastSync.current['__config'] = ser
      setDoc(fsDoc(getDb(), 'households', hid, 'data', 'config'), cfg).catch(() => {})
    }
  }, [
    cloud.status,
    hid,
    state.settings.shareAiWithFamily,
    state.settings.geminiApiKey,
    state.settings.geminiApiKey2,
    state.settings.geminiModel,
    state.settings.geminiModelLight,
  ])

  // 送信：ローカルの変更を世帯データへ反映（エコー防止）
  useEffect(() => {
    if (cloud.status !== 'on' || !hid) return
    for (const col of SYNCED) {
      const items = stripImages(col, state[col] as unknown[])
      const ser = JSON.stringify(items)
      if (ser !== lastSync.current[col]) {
        lastSync.current[col] = ser
        // JSON.parse(ser) で undefined フィールドを除去（Firestoreは undefined 不可）
        setDoc(fsDoc(getDb(), 'households', hid, 'data', col), { items: JSON.parse(ser) }).catch(() => {})
      }
    }
  }, [cloud.status, hid, state.docs, state.events, state.shopping, state.recipes, state.meals, state.inventory, state.family])

  // 自分(この端末の利用者)を家族リストに常に存在させる（同期で消えても再登録）
  useEffect(() => {
    const { memberName, memberColor, memberId, memberPhoto } = state.settings
    if (!memberName || !memberId) return
    setState((s) => {
      const idx = s.family.findIndex((f) => f.id === memberId)
      const self = { id: memberId, name: memberName, color: memberColor || '#3b82f6', photo: memberPhoto || undefined }
      if (idx === -1) return { ...s, family: [...s.family, self] }
      const cur = s.family[idx]
      if (cur.name === self.name && cur.color === self.color && cur.photo === self.photo) return s
      const fam = s.family.slice()
      fam[idx] = { ...cur, ...self }
      return { ...s, family: fam }
    })
  }, [state.settings.memberName, state.settings.memberColor, state.settings.memberPhoto, state.settings.memberId, state.family])

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
    const aiSettings: Settings = {
      ...state.settings,
      geminiApiKey: state.settings.geminiApiKey || cloudAI.geminiApiKey || '',
      geminiApiKey2: state.settings.geminiApiKey2 || cloudAI.geminiApiKey2 || '',
      geminiModel: state.settings.geminiModel || cloudAI.geminiModel || DEFAULT_MODEL,
      geminiModelLight: state.settings.geminiModelLight || cloudAI.geminiModelLight || '',
    }
    return {
      state,
      aiSettings,
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
      removeEventSeries: (seriesId) =>
        patch((s) => ({ ...s, events: s.events.filter((e) => e.seriesId !== seriesId) })),
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
      exportData: () => JSON.stringify({ app: 'smart-peta', version: 1, exportedAt: Date.now(), state }),
      importData: (json) => {
        try {
          const parsed = JSON.parse(json)
          // バックアップ形式 {state:{...}} でも、状態そのものでも受け付ける
          const data = (parsed && parsed.state ? parsed.state : parsed) as Partial<AppState>
          if (!data || typeof data !== 'object') return false
          const base = initialState()
          const next: AppState = {
            ...base,
            ...data,
            docs: Array.isArray(data.docs) ? data.docs : [],
            events: Array.isArray(data.events) ? data.events : [],
            recipes: Array.isArray(data.recipes) ? data.recipes : [],
            shopping: Array.isArray(data.shopping) ? data.shopping : [],
            meals: Array.isArray(data.meals) ? data.meals : [],
            inventory: Array.isArray(data.inventory) ? data.inventory : [],
            family: Array.isArray(data.family) && data.family.length ? data.family : base.family,
            settings: { ...base.settings, ...(data.settings ?? {}) },
          }
          lastSync.current = {}
          imgPushed.current = {}
          setState(next)
          return true
        } catch {
          return false
        }
      },
      cloud,
      createHousehold: async (name) => {
        const cfg = resolveConfig(state.settings.firebaseConfig)
        if (!cfg) throw new Error('先にFirebase設定(JSON)を入力してください。')
        initFirebase(cfg)
        const myUid = await ensureAnonSignIn()
        const newHid = randomId(20)
        await setDoc(fsDoc(getDb(), 'households', newHid), {
          name: name || 'わが家',
          createdBy: myUid,
          members: { [myUid]: true },
          createdAt: Date.now(),
        })
        // 現在のローカルデータを世帯へアップロード
        for (const col of SYNCED) {
          const items = stripImages(col, state[col] as unknown[])
          const ser = JSON.stringify(items)
          lastSync.current[col] = ser
          await setDoc(fsDoc(getDb(), 'households', newHid, 'data', col), { items: JSON.parse(ser) })
        }
        patch((s) => ({ ...s, settings: { ...s.settings, householdId: newHid, householdName2: name || 'わが家' } }))
        return newHid
      },
      joinHousehold: async (code, configStr) => {
        const configToUse = configStr ?? state.settings.firebaseConfig
        const cfg = resolveConfig(configToUse)
        if (!cfg) throw new Error('先にFirebase設定(JSON)を入力してください。')
        const targetHid = code.trim()
        if (!targetHid) throw new Error('参加コードを入力してください。')
        initFirebase(cfg)
        const myUid = await ensureAnonSignIn()
        try {
          await updateDoc(fsDoc(getDb(), 'households', targetHid), { [`members.${myUid}`]: true })
        } catch {
          throw new Error('参加に失敗しました。コードをご確認ください。')
        }
        let hname = '家族'
        try {
          const snap = await getDoc(fsDoc(getDb(), 'households', targetHid))
          if (snap.exists()) hname = (snap.data() as { name?: string }).name ?? '家族'
        } catch {
          /* noop */
        }
        lastSync.current = {}
        // 初回受信でこの端末のデータを世帯にマージ（既存予定などの消失を防ぐ）
        mergeCols.current = new Set(SYNCED)
        patch((s) => ({
          ...s,
          settings: { ...s.settings, firebaseConfig: configToUse, householdId: targetHid, householdName2: hname },
        }))
      },
      leaveHousehold: () => {
        lastSync.current = {}
        patch((s) => ({ ...s, settings: { ...s.settings, householdId: undefined } }))
      },
    }
  }, [state, cloud, patch, cloudAI])

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
