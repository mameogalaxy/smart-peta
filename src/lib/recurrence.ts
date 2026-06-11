import { addDaysISO, addMonthsISO } from './util'

/** くり返しの種別 */
export type Repeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

export const REPEATS: { label: string; value: Repeat }[] = [
  { label: '繰り返さない', value: 'none' },
  { label: '毎日', value: 'daily' },
  { label: '毎週', value: 'weekly' },
  { label: '隔週', value: 'biweekly' },
  { label: '毎月', value: 'monthly' },
]

/** 開始日と繰り返し設定から、日付の配列を生成（先頭=開始日） */
export function buildRepeatDates(start: string, repeat: Repeat, count: number): string[] {
  if (repeat === 'none') return [start]
  const dates: string[] = []
  for (let i = 0; i < count; i++) {
    if (repeat === 'daily') dates.push(addDaysISO(start, i))
    else if (repeat === 'weekly') dates.push(addDaysISO(start, i * 7))
    else if (repeat === 'biweekly') dates.push(addDaysISO(start, i * 14))
    else if (repeat === 'monthly') dates.push(addMonthsISO(start, i))
  }
  return dates
}
