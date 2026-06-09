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

function inferYear(month: number, day: number, base: Date): number {
  const y = base.getFullYear()
  const cand = new Date(y, month - 1, day)
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return cand.getTime() >= b.getTime() ? y : y + 1
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** テキストから日付付きの予定候補を抽出（AI不要・簡易） */
export function extractDates(text: string, todayIso = todayISO()): { title: string; date: string; time?: string }[] {
  const base = new Date(todayIso)
  const lines = text.split(/\n+/)
  const out: { title: string; date: string; time?: string }[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    let m: RegExpExecArray | null
    let date: string | null = null

    // 2026年6月18日
    if ((m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(line))) {
      date = iso(Number(m[1]), Number(m[2]), Number(m[3]))
    } else if ((m = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(line))) {
      const mo = Number(m[1])
      const d = Number(m[2])
      date = iso(inferYear(mo, d, base), mo, d)
    } else if ((m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(line))) {
      const mo = Number(m[1])
      const d = Number(m[2])
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = iso(inferYear(mo, d, base), mo, d)
    }
    if (!date) continue

    const tm = /(\d{1,2})\s*[:時]\s*(\d{2})/.exec(line)
    const time = tm ? `${String(Number(tm[1])).padStart(2, '0')}:${tm[2]}` : undefined

    // 日付表記を除いた行をタイトルに
    let title = line
      .replace(/\d{4}\s*年/, '')
      .replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/, '')
      .replace(/\b\d{1,2}\/\d{1,2}\b/, '')
      .replace(/\d{1,2}\s*[:時]\s*\d{2}\s*分?/, '')
      .replace(/[（(].*?[)）]/g, '')
      .replace(/[・:：\-—\s]+/g, ' ')
      .trim()
      .slice(0, 30)
    if (!title) title = '予定'

    const key = date + title
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ title, date, time })
  }
  return out
}
