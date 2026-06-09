// アプリのアイコンをインラインのデータURLとして持つ。
// 単体HTML(file://)で開いたときも /icon.svg に依存せず表示できるようにするため。
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0.12" y1="0.05" x2="0.92" y2="0.95"><stop offset="0" stop-color="#5b63e6"/><stop offset="0.5" stop-color="#3b82f6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
<rect width="512" height="512" rx="118" fill="#ffffff"/>
<path fill="none" stroke="url(#g)" stroke-width="60" stroke-linecap="round" d="M322 360 A132 132 0 1 0 250 388"/>
<path fill="url(#g)" d="M232 330 q-6 70 14 118 q34 -28 40 -86 z"/>
</svg>`

export const ICON_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`

/** ブランド表示名 */
export const APP_NAME = 'スマートピタ'
export const APP_TAGLINE = '冷蔵庫の紙をゼロにする、家族のためのスマート掲示板'
