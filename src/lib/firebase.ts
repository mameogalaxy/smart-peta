import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

/** 設定文字列から Firebase config を取り出す。JSON でも、コンソールのJSオブジェクト形式でも可。無効なら null。 */
export function parseFirebaseConfig(raw: string | undefined): Record<string, string> | null {
  if (!raw || !raw.trim()) return null
  let t = raw.trim()
  // `const firebaseConfig = {...}` を含むスニペット全体を貼っても、その config オブジェクトだけを抽出する
  const kw = t.indexOf('firebaseConfig')
  if (kw >= 0) t = t.slice(kw)
  const open = t.indexOf('{')
  if (open >= 0) {
    let depth = 0
    let end = -1
    for (let i = open; i < t.length; i++) {
      if (t[i] === '{') depth++
      else if (t[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    t = end >= 0 ? t.slice(open, end + 1) : t.slice(open)
  }
  const tryParse = (str: string): Record<string, unknown> | null => {
    try {
      const o = JSON.parse(str)
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  let cfg = tryParse(t)
  if (!cfg) {
    // JSオブジェクト（キー無引用符・シングルクォート・末尾カンマ）を JSON へ寄せる
    const jsonish = t
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1')
    cfg = tryParse(jsonish)
  }
  if (cfg && typeof cfg.apiKey === 'string' && typeof cfg.projectId === 'string') return cfg as Record<string, string>
  return null
}

export function initFirebase(config: Record<string, unknown>): { auth: Auth; db: Firestore } {
  app = getApps().length ? getApp() : initializeApp(config)
  auth = getAuth(app)
  db = getFirestore(app)
  return { auth, db }
}

/** 匿名サインインして UID を返す（既にサインイン済みならそれを使う） */
export function ensureAnonSignIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!auth) return reject(new Error('Firebase 未初期化'))
    const a = auth
    if (a.currentUser) return resolve(a.currentUser.uid)
    const unsub = onAuthStateChanged(a, (u) => {
      if (u) {
        unsub()
        resolve(u.uid)
      }
    })
    signInAnonymously(a).catch((e) => {
      unsub()
      reject(e)
    })
  })
}

export function getDb(): Firestore {
  if (!db) throw new Error('Firestore 未初期化')
  return db
}

export function getUid(): string | null {
  return auth?.currentUser?.uid ?? null
}

/** 招待用：config(JSON文字列)と世帯IDをURLセーフな文字列にまとめる */
export function encodeInvite(config: string, hid: string): string {
  const payload = JSON.stringify({ c: config, h: hid })
  return btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function decodeInvite(s: string): { c: string; h: string } | null {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b)))
    const o = JSON.parse(json)
    if (o && typeof o.c === 'string' && typeof o.h === 'string') return o
    return null
  } catch {
    return null
  }
}

/** 短いランダムID（世帯ID/招待コード用） */
export function randomId(len = 20): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length]
  return s
}
