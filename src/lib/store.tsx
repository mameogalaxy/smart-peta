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
  DocCategoryDefinition,
  DocItem,
  FamilyMember,
  InventoryItem,
  LunchMenuSheet,
  MealPlan,
  Recipe,
  Settings,
  ShoppingItem,
} from '../types'
import { DOC_CATEGORIES } from '../types'
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

/**
 * localStorage へ保存する。容量超過(QuotaExceeded)で全消失しないよう、
 * 失敗したら画像を段階的に外して「本文データだけでも必ず保存」する。
 * （書類・給食の画像はクラウドに別保存され、再接続で復元される）
 */
function persistState(state: AppState): void {
  const attempts: (() => AppState)[] = [
    () => state,
    // 1) 給食献立表の画像を外す（PDF多ページが最も重い）
    () => ({ ...state, lunchMenuSheets: state.lunchMenuSheets.map((s) => ({ ...s, images: [] })) }),
    // 2) さらに書類の画像も外す
    () => ({
      ...state,
      lunchMenuSheets: state.lunchMenuSheets.map((s) => ({ ...s, images: [] })),
      docs: state.docs.map(({ image: _i, images: _is, ...d }) => d),
    }),
    // 3) レシピ画像も外して本文だけ確実に残す
    () => ({
      ...state,
      lunchMenuSheets: state.lunchMenuSheets.map((s) => ({ ...s, images: [] })),
      docs: state.docs.map(({ image: _i, images: _is, ...d }) => d),
      recipes: state.recipes.map(({ image: _i, ...r }) => r),
    }),
  ]
  for (const make of attempts) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(make()))
      return
    } catch {
      /* 容量超過 → 次の段階（画像を外す）で再試行 */
    }
  }
}


function resolveConfig(raw?: string): Record<string, unknown> | null {
  const fromSetting = parseFirebaseConfig(raw)
  if (fromSetting) return fromSetting
  return HAS_DEFAULT_FIREBASE ? (DEFAULT_FIREBASE_CONFIG as Record<string, unknown>) : null
}

/** クラウド同期する配列コレクション（画像は docs から除外して送る） */
const SYNCED = ['docs', 'customDocCategories', 'hiddenDocCategoryIds', 'events', 'shopping', 'recipes', 'meals', 'lunchMenuSheets', 'customMealMoods', 'inventory', 'family'] as const
type SyncedKey = (typeof SYNCED)[number]

export type CloudStatus = 'off' | 'connecting' | 'on' | 'error'

function stripImages(col: SyncedKey, raw: unknown[]): unknown[] {
  if (col === 'docs') {
    // 画像は items とは別（households/{hid}/data/img_{docId}）に同期するため、本文からは外す
    return (raw as DocItem[]).map(({ image: _img, images: _imgs, ...rest }) => rest)
  }
  if (col === 'lunchMenuSheets') {
    return (raw as LunchMenuSheet[]).map(({ images: _images, ...rest }) => rest)
  }
  if (col === 'events') {
    return (raw as CalendarEvent[]).map(({ images: _images, ...rest }) => rest)
  }
  return raw
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
    customDocCategories: [],
    hiddenDocCategoryIds: [],
    events: [],
    recipes: [],
    shopping: [],
    meals: [],
    lunchMenuSheets: [],
    customMealMoods: [],
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
      customMealMoods: parsed.customMealMoods ?? [],
      lunchMenuSheets: parsed.lunchMenuSheets ?? [],
      customDocCategories: parsed.customDocCategories ?? [],
      hiddenDocCategoryIds: parsed.hiddenDocCategoryIds ?? [],
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
  addDocCategory: (label: string, color: string) => void
  removeDocCategory: (id: string) => void
  restoreDocCategory: (id: string) => void
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
  addLunchMenuSheet: (sheet: LunchMenuSheet) => void
  updateLunchMenuSheet: (id: string, patch: Partial<LunchMenuSheet>) => void
  removeLunchMenuSheet: (id: string) => void
  addMealMood: (mood: string) => void
  removeMealMood: (mood: string) => void
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
  /** バックアップ復元直後、復元内容がクラウドへ反映されるまで古い受信で上書きさせない */
  const backupRestoreTargets = useRef<Partial<Record<SyncedKey, string>>>({})
  /** 参加直後、最初の受信でローカルの内容を世帯にマージする対象コレクション（データ消失防止） */
  const mergeCols = useRef<Set<string>>(new Set())
  /** クラウドから受信した書類画像（docId -> images）。ローカルに無い書類へ表示用に付与 */
  const remoteDocImages = useRef<Map<string, string[]>>(new Map())
  /** 家族から共有された給食献立表画像（sheetId -> pages） */
  const remoteLunchImages = useRef<Map<string, string[]>>(new Map())
  /** 家族から共有された予定画像（eventId -> pages） */
  const remoteEventImages = useRef<Map<string, string[]>>(new Map())
  /** 各書類画像の最終同期シグネチャ（再送/エコー防止） */
  const imgPushed = useRef<Record<string, string>>({})
  /** 各書類のクラウド側ページ数（減ったページの掃除用） */
  const imgPageCount = useRef<Record<string, number>>({})
  const lunchImgPushed = useRef<Record<string, string>>({})
  const eventImgPushed = useRef<Record<string, string>>({})
  /** 家族から共有されたAI設定（APIキー・モデル）。自分のキーが無いときの補完に使う。 */
  const [cloudAI, setCloudAI] = useState<Partial<Settings>>({})

  const applyRemote = useCallback((col: SyncedKey, items: unknown[]) => {
    const incoming = JSON.stringify(items)
    const restoreTarget = backupRestoreTargets.current[col]
    if (restoreTarget !== undefined) {
      if (incoming !== restoreTarget) {
        // 復元前のクラウド状態は採用しない。同期effectを再実行して復元内容をアップロードする。
        lastSync.current[col] = '__backup_restore_pending__'
        setState((s) => ({ ...s }))
        return
      }
      delete backupRestoreTargets.current[col]
    }
    // 参加直後の初回受信だけはローカルを世帯へマージ（既存の予定などが消えないように）
    const doMerge = mergeCols.current.has(col)
    if (doMerge) mergeCols.current.delete(col)
    // lastSync は「受信した世帯の内容」を記録。マージ時は state がそれと変わるので送信effectが発火→マージ結果をアップロード
    lastSync.current[col] = incoming
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
      if (col === 'lunchMenuSheets') {
        const localById = new Map(s.lunchMenuSheets.map((sheet) => [sheet.id, sheet]))
        const remote = (items as LunchMenuSheet[]).map((sheet) => {
          const local = localById.get(sheet.id)
          const remoteImages = remoteLunchImages.current.get(sheet.id)
          const images = local?.images?.length ? local.images : remoteImages ?? []
          if (remoteImages?.length && !local?.images?.length) lunchImgPushed.current[sheet.id] = imgSig(remoteImages)
          return { ...sheet, images }
        })
        if (doMerge) {
          const byId = new Map<string, LunchMenuSheet>(remote.map((sheet) => [sheet.id, sheet]))
          for (const sheet of s.lunchMenuSheets) if (!byId.has(sheet.id)) byId.set(sheet.id, sheet)
          return { ...s, lunchMenuSheets: [...byId.values()] }
        }
        return { ...s, lunchMenuSheets: remote }
      }
      if (col === 'events') {
        const localById = new Map(s.events.map((event) => [event.id, event]))
        const remote = (items as CalendarEvent[]).map((event) => {
          const local = localById.get(event.id)
          const remoteImages = remoteEventImages.current.get(event.id)
          const images = local?.images?.length ? local.images : remoteImages
          if (remoteImages?.length && !local?.images?.length) eventImgPushed.current[event.id] = imgSig(remoteImages)
          return { ...event, images }
        })
        if (doMerge) {
          const byId = new Map<string, CalendarEvent>(remote.map((event) => [event.id, event]))
          for (const event of s.events) if (!byId.has(event.id)) byId.set(event.id, event)
          return { ...s, events: [...byId.values()] }
        }
        return { ...s, events: remote }
      }
      if (col === 'hiddenDocCategoryIds' || col === 'customMealMoods') {
        const remote = items.filter((x): x is string => typeof x === 'string')
        const local = col === 'hiddenDocCategoryIds' ? s.hiddenDocCategoryIds : s.customMealMoods
        return { ...s, [col]: doMerge ? [...new Set([...remote, ...local])] : remote } as AppState
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
      remoteLunchImages.current = new Map()
      remoteEventImages.current = new Map()
      imgPushed.current = {}
      imgPageCount.current = {}
      lunchImgPushed.current = {}
      eventImgPushed.current = {}
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
              const lunchImgs = new Map<string, string[]>()
              const eventImgs = new Map<string, string[]>()
              // 書類画像はページごとの個別ドキュメント（img_{docId}__p{i}）で受信し、後で結合する
              const docPages = new Map<string, Map<number, string>>()
              snap.forEach((docu) => {
                if (docu.id.startsWith('eventimg_')) {
                  const a = (docu.data() as { images?: string[] }).images
                  if (a && a.length) eventImgs.set(docu.id.slice(9), a)
                  return
                }
                if (docu.id.startsWith('lunchimg_')) {
                  const a = (docu.data() as { images?: string[] }).images
                  if (a && a.length) lunchImgs.set(docu.id.slice(9), a)
                  return
                }
                if (!docu.id.startsWith('img_')) return
                const rest = docu.id.slice(4)
                const sep = rest.indexOf('__p')
                if (sep >= 0) {
                  const docId = rest.slice(0, sep)
                  const idx = Number(rest.slice(sep + 3))
                  const image = (docu.data() as { image?: string }).image
                  if (image && Number.isFinite(idx)) {
                    if (!docPages.has(docId)) docPages.set(docId, new Map())
                    docPages.get(docId)!.set(idx, image)
                  }
                  return
                }
                // 旧形式（1ドキュメントにまとめ）も後方互換で読む
                const a = (docu.data() as { images?: string[] }).images
                if (a && a.length) imgs.set(rest, a)
              })
              // ページ個別版は結合して旧形式を上書き
              for (const [docId, pages] of docPages) {
                const arr = [...pages.entries()].sort((x, y) => x[0] - y[0]).map(([, image]) => image)
                if (arr.length) imgs.set(docId, arr)
              }
              remoteDocImages.current = imgs
              remoteLunchImages.current = lunchImgs
              remoteEventImages.current = eventImgs
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
                const lunchMenuSheets = s.lunchMenuSheets.map((sheet) => {
                  if (sheet.images?.length) return sheet
                  const images = lunchImgs.get(sheet.id)
                  if (!images?.length) return sheet
                  lunchImgPushed.current[sheet.id] = imgSig(images)
                  changed = true
                  return { ...sheet, images }
                })
                const events = s.events.map((event) => {
                  if (event.images?.length) return event
                  const images = eventImgs.get(event.id)
                  if (!images?.length) return event
                  eventImgPushed.current[event.id] = imgSig(images)
                  changed = true
                  return { ...event, images }
                })
                return changed ? { ...s, docs, lunchMenuSheets, events } : s
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
      remoteLunchImages.current = new Map()
      remoteEventImages.current = new Map()
      imgPushed.current = {}
      imgPageCount.current = {}
      lunchImgPushed.current = {}
      eventImgPushed.current = {}
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
          // ページごとに別ドキュメントへ保存（1ドキュメント=1MB制限を超えず、3枚目以降も確実に同期）
          for (let i = 0; i < compressed.length; i++) {
            await setDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${d.id}__p${i}`), { image: compressed[i], i, docId: d.id })
          }
          // ページが減った分の掃除＋旧まとめ形式の削除（移行）
          const prev = imgPageCount.current[d.id] ?? 0
          for (let i = compressed.length; i < prev; i++) {
            deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${d.id}__p${i}`)).catch(() => {})
          }
          imgPageCount.current[d.id] = compressed.length
          deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${d.id}`)).catch(() => {})
        } catch {
          // オフライン等は共有をスキップ（本文は同期済み）。次回変更時に再送される
          imgPushed.current[d.id] = ''
        }
      }
      // ローカルで削除された書類の画像はクラウドからも削除
      for (const id of Object.keys(imgPushed.current)) {
        if (!state.docs.some((d) => d.id === id)) {
          const pages = imgPageCount.current[id] ?? 0
          delete imgPushed.current[id]
          delete imgPageCount.current[id]
          deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${id}`)).catch(() => {})
          for (let i = 0; i < pages; i++) {
            deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `img_${id}__p${i}`)).catch(() => {})
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud.status, hid, state.docs])

  // 送信：給食献立表のページ画像を世帯へ共有
  useEffect(() => {
    if (cloud.status !== 'on' || !hid) return
    let cancelled = false
    ;(async () => {
      for (const sheet of state.lunchMenuSheets) {
        if (!sheet.images.length) continue
        const sig = imgSig(sheet.images)
        if (lunchImgPushed.current[sheet.id] === sig) continue
        lunchImgPushed.current[sheet.id] = sig
        try {
          const compressed = await Promise.all(sheet.images.map((image) => compressForShare(image)))
          if (cancelled) return
          await setDoc(fsDoc(getDb(), 'households', hid, 'data', `lunchimg_${sheet.id}`), { images: compressed })
        } catch {
          // 容量超過/オフライン時もローカルでは閲覧可能
        }
      }
      for (const id of Object.keys(lunchImgPushed.current)) {
        if (!state.lunchMenuSheets.some((sheet) => sheet.id === id)) {
          delete lunchImgPushed.current[id]
          deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `lunchimg_${id}`)).catch(() => {})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud.status, hid, state.lunchMenuSheets])

  // 送信：予定の添付画像を世帯へ共有
  useEffect(() => {
    if (cloud.status !== 'on' || !hid) return
    let cancelled = false
    ;(async () => {
      for (const event of state.events) {
        const images = event.images ?? []
        if (!images.length) continue
        const sig = imgSig(images)
        if (eventImgPushed.current[event.id] === sig) continue
        eventImgPushed.current[event.id] = sig
        try {
          const compressed = await Promise.all(images.map((image) => compressForShare(image)))
          if (cancelled) return
          await setDoc(fsDoc(getDb(), 'households', hid, 'data', `eventimg_${event.id}`), { images: compressed })
        } catch {
          // 容量超過/オフライン時も、この端末では閲覧可能
        }
      }
      for (const id of Object.keys(eventImgPushed.current)) {
        if (!state.events.some((event) => event.id === id && event.images?.length)) {
          delete eventImgPushed.current[id]
          deleteDoc(fsDoc(getDb(), 'households', hid, 'data', `eventimg_${id}`)).catch(() => {})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud.status, hid, state.events])

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
      // 重要: クラウドからの初回受信(lastSync記録)前は送らない。
      // 参加直後にこの端末の空データで世帯データを上書きしてしまう事故を防ぐ。
      if (!(col in lastSync.current)) continue
      const items = stripImages(col, state[col] as unknown[])
      const ser = JSON.stringify(items)
      if (ser !== lastSync.current[col]) {
        if (backupRestoreTargets.current[col] !== undefined) backupRestoreTargets.current[col] = ser
        lastSync.current[col] = ser
        // JSON.parse(ser) で undefined フィールドを除去（Firestoreは undefined 不可）
        setDoc(fsDoc(getDb(), 'households', hid, 'data', col), { items: JSON.parse(ser) }).catch(() => {})
      }
    }
  }, [cloud.status, hid, state.docs, state.customDocCategories, state.hiddenDocCategoryIds, state.events, state.shopping, state.recipes, state.meals, state.lunchMenuSheets, state.customMealMoods, state.inventory, state.family])

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
    persistState(state)
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
      addDocCategory: (label, color) =>
        patch((s) => {
          const name = label.trim()
          if (!name || [...DOC_CATEGORIES, ...s.customDocCategories].some((c) => c.label.toLowerCase() === name.toLowerCase())) return s
          return {
            ...s,
            customDocCategories: [
              ...s.customDocCategories,
              { id: `custom-${uid()}`, label: name, color, custom: true } as DocCategoryDefinition,
            ],
          }
        }),
      removeDocCategory: (id) =>
        patch((s) => ({
          ...s,
          customDocCategories: s.customDocCategories.filter((c) => c.id !== id),
          hiddenDocCategoryIds: s.customDocCategories.some((c) => c.id === id)
            ? s.hiddenDocCategoryIds
            : [...new Set([...s.hiddenDocCategoryIds, id])],
          docs: s.docs.map((d) => (d.category === id ? { ...d, category: 'other' } : d)),
          events: s.events.map((e) => (e.category === id ? { ...e, category: 'other' } : e)),
        })),
      restoreDocCategory: (id) =>
        patch((s) => ({ ...s, hiddenDocCategoryIds: s.hiddenDocCategoryIds.filter((x) => x !== id) })),
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
      addLunchMenuSheet: (sheet) => patch((s) => ({ ...s, lunchMenuSheets: [sheet, ...s.lunchMenuSheets] })),
      updateLunchMenuSheet: (id, sheetPatch) =>
        patch((s) => ({
          ...s,
          lunchMenuSheets: s.lunchMenuSheets.map((sheet) => (sheet.id === id ? { ...sheet, ...sheetPatch } : sheet)),
        })),
      removeLunchMenuSheet: (id) => patch((s) => ({ ...s, lunchMenuSheets: s.lunchMenuSheets.filter((sheet) => sheet.id !== id) })),
      addMealMood: (mood) =>
        patch((s) => {
          const value = mood.trim()
          if (!value || s.customMealMoods.some((x) => x.toLowerCase() === value.toLowerCase())) return s
          return { ...s, customMealMoods: [...s.customMealMoods, value] }
        }),
      removeMealMood: (mood) =>
        patch((s) => ({ ...s, customMealMoods: s.customMealMoods.filter((x) => x !== mood) })),
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
          const norm = (n: string) => n.trim().toLowerCase()
          const existing = new Set(s.inventory.map((i) => norm(i.name)))
          const seen = new Set<string>()
          const fresh = items
            .map((i) => ({ ...i, name: i.name.trim() }))
            .filter((i) => {
              const k = norm(i.name)
              if (!i.name || existing.has(k) || seen.has(k)) return false
              seen.add(k)
              return true
            })
          return { ...s, inventory: [...fresh, ...s.inventory] }
        }),
      removeInventory: (id) => patch((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== id) })),
      clearInventory: () => patch((s) => ({ ...s, inventory: [] })),
      setFamily: (f) =>
        patch((s) => {
          const ids = new Set(f.map((member) => member.id))
          return {
            ...s,
            family: f,
            docs: s.docs.map((doc) => {
              const audienceIds = doc.audienceIds?.filter((id) => ids.has(id)) ?? []
              return { ...doc, audienceIds: audienceIds.length ? audienceIds : undefined }
            }),
          }
        }),
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
            lunchMenuSheets: Array.isArray(data.lunchMenuSheets) ? data.lunchMenuSheets : [],
            customMealMoods: Array.isArray(data.customMealMoods) ? data.customMealMoods : [],
            inventory: Array.isArray(data.inventory) ? data.inventory : [],
            family: Array.isArray(data.family) && data.family.length ? data.family : base.family,
            settings: { ...base.settings, ...(data.settings ?? {}) },
          }
          // effectを待たずに端末へ保存する。容量不足などで保存できない場合は復元成功にしない。
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))

          const restoreTargets: Partial<Record<SyncedKey, string>> = {}
          for (const col of SYNCED) {
            const items = stripImages(col, next[col] as unknown[])
            restoreTargets[col] = JSON.stringify(items)
            lastSync.current[col] = '__backup_restore_pending__'
          }
          backupRestoreTargets.current = restoreTargets
          mergeCols.current.clear()
          imgPushed.current = {}
          lunchImgPushed.current = {}
          eventImgPushed.current = {}
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
          if (backupRestoreTargets.current[col] !== undefined) backupRestoreTargets.current[col] = ser
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
