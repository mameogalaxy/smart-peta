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

function icsEscape(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function nowStampUtc(): string {
  const d = new Date()
  const p = (n: number) => pad(n)
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(
    d.getUTCMinutes(),
  )}${p(d.getUTCSeconds())}Z`
}

/**
 * 予定の .ics（iCalendar）テキストを生成する。
 * reminderMinutes >= 0 のとき VALARM（◯分前に通知）を付ける。
 * iPhone/Android どちらでもカレンダーに通知付きで追加できる。
 */
export function buildIcs(e: CalendarEvent, reminderMinutes: number): string {
  const d = parseISO(e.date) ?? new Date()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//smart-peta//JP',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@smart-peta`,
    `DTSTAMP:${nowStampUtc()}`,
  ]
  if (e.time) {
    const [hh, mm] = e.time.split(':').map((n) => Number(n))
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    // フローティング時刻（端末ローカルとして解釈される）
    lines.push(`DTSTART:${ymdhms(start)}`)
    lines.push(`DTEND:${ymdhms(end)}`)
  } else {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${ymd(d)}`)
    lines.push(`DTEND;VALUE=DATE:${ymd(end)}`)
  }
  lines.push(`SUMMARY:${icsEscape(e.title)}`)
  if (e.note) lines.push(`DESCRIPTION:${icsEscape(e.note)}`)
  if (reminderMinutes >= 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${reminderMinutes}M`, 'END:VALARM')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

/** .ics をダウンロード/オープンして端末カレンダーへの追加を促す */
export function addToCalendarIcs(e: CalendarEvent, reminderMinutes: number) {
  const ics = buildIcs(e, reminderMinutes)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(e.title || 'event').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 8000)
}
