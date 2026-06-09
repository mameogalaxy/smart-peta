import type { AppState } from '../types'
import type { LunchMenuResult, MealContext, MealSuggestion, ScanResult } from './gemini'
import { addDaysISO, todayISO, uid } from './util'

/**
 * APIキー未設定でもアプリを体験できるようにするための、
 * その場で生成するデモ用ダミー解析。実際の画像内容は読まず、
 * 「こういう結果が返る」というサンプルを返す。
 */
const SAMPLES: ScanResult[] = [
  {
    title: '学校だより 6月号 / 授業参観のお知らせ',
    category: 'school',
    summary: '6月の行事予定。授業参観と個人面談、給食費引き落とし日の連絡。',
    text: '［学校だより 6月号］\n授業参観 6/18(木) 13:30〜\n個人面談 6/24(水)〜6/26(金)\n給食費引き落とし 6/27\n持ち物: 上履き・筆記用具',
    events: [
      { title: '授業参観', date: addDaysISO(todayISO(), 10), time: '13:30', note: '上履き持参' },
      { title: '個人面談（提出: 希望日）', date: addDaysISO(todayISO(), 16) },
    ],
  },
  {
    title: 'ゴミ収集カレンダー',
    category: 'garbage',
    summary: '燃えるゴミは火・金、資源ゴミは水曜、不燃ゴミは第2・第4月曜。',
    text: '燃えるゴミ: 火・金\n資源(缶/びん/ペット): 水\n不燃ゴミ: 第2・第4 月曜\nプラ: 木',
    events: [{ title: '不燃ゴミの日', date: addDaysISO(todayISO(), 3), note: '第2月曜' }],
  },
  {
    title: '鶏むね肉のさっぱり南蛮',
    category: 'recipe',
    summary: '鶏むね肉で作る、揚げないヘルシー南蛮。タルタル添え。',
    text: '鶏むね肉のさっぱり南蛮（2人分）\n材料・手順は下記。',
    events: [],
    recipe: {
      servings: '2人分',
      ingredients: ['鶏むね肉 1枚', '卵 1個', '玉ねぎ 1/4個', '酢 大さじ2', '砂糖 大さじ1', '醤油 大さじ1', 'マヨネーズ 適量'],
      steps: [
        '鶏むね肉を一口大に切り、薄く片栗粉をまぶす',
        'フライパンで両面を焼く',
        '酢・砂糖・醤油を合わせて絡める',
        'ゆで卵と玉ねぎでタルタルを作り添える',
      ],
    },
  },
]

let counter = 0
export function demoScan(): ScanResult {
  const s = SAMPLES[counter % SAMPLES.length]
  counter++
  // 毎回 id が変わるよう参照を複製
  return JSON.parse(JSON.stringify(s)) as ScanResult
}

export function demoDinner(ctx: MealContext): MealSuggestion {
  const pool = ctx.availableRecipes.length
    ? ctx.availableRecipes
    : [
        { title: '鮭のホイル焼き', ingredients: ['生鮭 2切れ', '玉ねぎ', 'しめじ', 'バター', 'ポン酢'] },
        { title: '麻婆豆腐', ingredients: ['豆腐 1丁', '豚ひき肉 150g', '長ねぎ', '豆板醤', '味噌'] },
        { title: '豚の生姜焼き', ingredients: ['豚ロース 200g', '生姜', '玉ねぎ', '醤油', 'みりん'] },
      ]
  const pick = pool[Math.floor(Math.random() * pool.length)]
  return {
    dinner: pick.title,
    reason: `給食「${ctx.schoolLunch || '不明'}」と主菜が被らず、最近の献立とも重複しない一品です。（デモ提案）`,
    recipeTitle: ctx.availableRecipes.length ? pick.title : undefined,
    ingredients: pick.ingredients,
  }
}

export function demoLunchMenu(): LunchMenuResult {
  const base = todayISO()
  const menus = [
    'ごはん、鶏のから揚げ、ほうれん草のおひたし、みそ汁、牛乳',
    'コッペパン、ミートスパゲッティ、海藻サラダ、牛乳',
    'ごはん、さばの味噌煮、切り干し大根の煮物、すまし汁、牛乳',
    'カレーライス、福神漬、フルーツポンチ、牛乳',
    'ごはん、麻婆豆腐、バンサンスー、わかめスープ、牛乳',
    'ごはん、ハンバーグ、コーンソテー、野菜スープ、牛乳',
    'きつねうどん、ちくわの磯辺揚げ、おひたし、牛乳',
  ]
  const items = menus.map((menu, i) => ({ date: addDaysISO(base, i), menu }))
  return { items }
}

/** 初回起動時のサンプルデータ（家族メンバーのみ用意） */
export function seedFamily(): AppState['family'] {
  return [
    { id: uid(), name: 'パパ', color: '#3b82f6' },
    { id: uid(), name: 'ママ', color: '#ec4899' },
    { id: uid(), name: 'こども', color: '#14b8a6' },
  ]
}
