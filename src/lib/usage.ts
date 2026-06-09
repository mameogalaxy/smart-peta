import { todayISO } from './util'

const KEY = 'smart-peta:usage'

export interface Usage {
  /** 累計リクエスト数 */
  totalReq: number
  /** 累計トークン */
  totalTokens: number
  /** 集計対象日(YYYY-MM-DD) */
  day: string
  /** 当日のリクエスト数 */
  dayReq: number
  /** 当日のトークン */
  dayTokens: number
}

function empty(): Usage {
  return { totalReq: 0, totalTokens: 0, day: todayISO(), dayReq: 0, dayTokens: 0 }
}

export function getUsage(): Usage {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const u = { ...empty(), ...(JSON.parse(raw) as Partial<Usage>) }
    if (u.day !== todayISO()) {
      u.day = todayISO()
      u.dayReq = 0
      u.dayTokens = 0
    }
    return u
  } catch {
    return empty()
  }
}

/** 1リクエスト分の使用量を記録 */
export function recordUsage(tokens: number) {
  const u = getUsage()
  u.totalReq += 1
  u.totalTokens += tokens
  u.dayReq += 1
  u.dayTokens += tokens
  try {
    localStorage.setItem(KEY, JSON.stringify(u))
  } catch {
    /* noop */
  }
}

export function resetUsage() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
