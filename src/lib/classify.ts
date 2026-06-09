import type { DocCategory } from '../types'
import { todayISO } from './util'

/** テキストからキーワードでカテゴリを推定（AI不要） */
export function classifyByKeywords(text: string): DocCategory {
  const t = text
  if (/電気|ガス|水道|光熱費|料金|検針|請求書|使用量|kWh|電力|ガス代|水道代|口座振替/.test(t)) return 'utility'
  if (/取扱説明|説明書|保証書|マニュアル|使い方|型番|品番|お手入れ|取り扱い/.test(t)) return 'manual'
  if (/学校|授業参観|給食|保護者|PTA|時間割|学年|連絡帳|遠足|参観|懇談|提出/.test(t)) return 'school'
  if (/ゴミ|ごみ|収集|分別|資源|燃える|燃えない|不燃|可燃|粗大|回収日/.test(t)) return 'garbage'
  if (/会議|出張|見積|契約|業務|プロジェクト|社内|納期|議事録|案件|請求/.test(t)) return 'work'
  if (/材料|作り方|レシピ|分量|大さじ|小さじ|下ごしらえ|加熱|焼く|煮る/.test(t)) return 'recipe'
  return 'other'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function inferYear(month: number, day: number, base: Date): number {
  const y = base.getFullYear()
  const cand = new Date(y, month - 1, day)
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return cand.getTime() >= b.getTime() ? y : y + 1
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}
function shortMd(isoStr: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoStr)
  return m ? `${Number(m[1])}/${Number(m[2])}` : isoStr
}

const DATE_SRC = '(?:(\\d{4})\\s*年)?\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日|(\\d{1,2})/(\\d{1,2})'

/** テキストから日付付きの予定候補を抽出（AI不要）。実施期間(〜)にも対応。 */
export function extractDates(text: string, todayIso = todayISO()): { title: string; date: string; time?: string; note?: string }[] {
  const base = new Date(todayIso)
  const lines = text.split(/\n+/)
  const out: { title: string; date: string; time?: string; note?: string }[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const re = new RegExp(DATE_SRC, 'g')
    const dates: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      let mo: number
      let d: number
      let y: number
      if (m[2] && m[3]) {
        mo = Number(m[2])
        d = Number(m[3])
        y = m[1] ? Number(m[1]) : inferYear(mo, d, base)
      } else if (m[4] && m[5]) {
        mo = Number(m[4])
        d = Number(m[5])
        if (mo < 1 || mo > 12 || d < 1 || d > 31) continue
        y = inferYear(mo, d, base)
      } else {
        continue
      }
      dates.push(iso(y, mo, d))
    }
    if (!dates.length) continue

    const tm = /(\d{1,2})\s*[:時]\s*(\d{2})/.exec(line)
    const time = tm ? `${pad(Number(tm[1]))}:${tm[2]}` : undefined

    let title = line
      .replace(new RegExp(DATE_SRC, 'g'), '')
      .replace(/\d{1,2}\s*[:時]\s*\d{2}\s*分?/g, '')
      .replace(/[（(].*?[)）]/g, '')
      .replace(/[〜~ー−－\-・:：\s]+/g, ' ')
      .trim()
      .slice(0, 30)
    if (!title) title = '予定'

    const start = dates[0]
    const end = dates.length > 1 ? dates[dates.length - 1] : undefined
    const note = end && end !== start ? `〜${shortMd(end)}（実施期間）` : undefined

    const key = start + title
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ title, date: start, time, note })
  }
  return out
}
