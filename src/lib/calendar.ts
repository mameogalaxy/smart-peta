import type { CalendarEvent } from '../types'
import { parseISO } from './util'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function ymd(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
function ymdhms(d: Date): string {
  return `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

/**
 * Googleカレンダーの「予定を追加」テンプレートURLを生成する。
 * タップするとGoogleカレンダーに予定が入り、そこで通知（アラーム）を設定できる。
 * 時刻ありは1時間の予定、時刻なしは終日予定にする。
 */
export function googleCalendarUrl(e: CalendarEvent): string {
  const d = parseISO(e.date) ?? new Date()
  let dates: string
  if (e.time) {
    const [hh, mm] = e.time.split(':').map((n) => Number(n))
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    dates = `${ymdhms(start)}/${ymdhms(end)}`
  } else {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    dates = `${ymd(d)}/${ymd(end)}`
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates,
    ctz: tz,
  })
  if (e.note) params.set('details', e.note)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
