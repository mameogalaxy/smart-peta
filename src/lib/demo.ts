import type { AppState } from '../types'
import type { FridgeScanResult, LunchMenuResult, MealContext, MealSuggestion, ScanResult } from './gemini'
import { addDaysISO, todayISO } from './util'

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
  const mainPool = ctx.availableRecipes.length
    ? ctx.availableRecipes
    : ctx.mood === 'あっさり'
      ? [{ title: '鮭と野菜の蒸し焼き', ingredients: ['生鮭 2切れ', 'キャベツ', 'しめじ', 'ポン酢'] }]
      : [{ title: '豚の生姜焼き', ingredients: ['豚ロース 200g', '生姜', '玉ねぎ', '醤油', 'みりん'] }]
  const pick = mainPool[Math.floor(Math.random() * mainPool.length)]
  const dishes = (ctx.courses.length ? ctx.courses : ['main' as const]).map((course) => ({
    course,
    name:
      course === 'main'
        ? pick.title
        : course === 'staple'
          ? 'ごはん'
          : course === 'side'
            ? '小松菜とにんじんのごま和え'
            : '豆腐とわかめのみそ汁',
  }))
  const extraIngredients = dishes.flatMap((dish) =>
    dish.course === 'side' ? ['小松菜', 'にんじん', 'すりごま'] : dish.course === 'soup' ? ['豆腐', 'わかめ', '味噌'] : [],
  )
  const fridge = ctx.fridgeItems.length ? `冷蔵庫の${ctx.fridgeItems.slice(0, 3).join('・')}を使い、` : ''
  return {
    dinner: dishes.map((dish) => dish.name).join('、'),
    dishes,
    reason: `${ctx.mood ? `「${ctx.mood}」の気分に合わせ、` : ''}${fridge}給食「${ctx.schoolLunch || '不明'}」と被りにくい献立です。（デモ提案）`,
    nutritionAdvice: '主菜のたんぱく質と副菜の野菜を組み合わせています。主食・汁物を選ばなかった場合は、量や塩分に合わせて追加してください。',
    recipeTitle: ctx.availableRecipes.length ? pick.title : undefined,
    ingredients: [...new Set([...pick.ingredients, ...extraIngredients])],
  }
}

export function demoFridge(): FridgeScanResult {
  return { items: ['卵', '牛乳', 'キャベツ', 'にんじん', '玉ねぎ', '豚こま肉', '豆腐', 'ピーマン', 'ウインナー', '味噌'] }
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

/** 初回起動時の家族メンバー（自己登録で埋まるため空で開始） */
export function seedFamily(): AppState['family'] {
  return []
}
