import { todayISO } from './util'

const KEY = 'smart-peta:usage'

export interface Usage {
  totalReq: number
  totalTokens: number
  totalPrompt: number
  totalOutput: number
  day: string
  dayReq: number
  dayTokens: number
  dayPrompt: number
  dayOutput: number
}

function empty(): Usage {
  return {
    totalReq: 0,
    totalTokens: 0,
    totalPrompt: 0,
    totalOutput: 0,
    day: todayISO(),
    dayReq: 0,
    dayTokens: 0,
    dayPrompt: 0,
    dayOutput: 0,
  }
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
      u.dayPrompt = 0
      u.dayOutput = 0
    }
    return u
  } catch {
    return empty()
  }
}

/** 1リクエスト分（入力/出力トークン）を記録 */
export function recordUsage(promptTokens: number, outputTokens: number) {
  const u = getUsage()
  const total = promptTokens + outputTokens
  u.totalReq += 1
  u.totalTokens += total
  u.totalPrompt += promptTokens
  u.totalOutput += outputTokens
  u.dayReq += 1
  u.dayTokens += total
  u.dayPrompt += promptTokens
  u.dayOutput += outputTokens
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
