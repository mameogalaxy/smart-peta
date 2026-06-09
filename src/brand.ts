// アプリのアイコンをインラインのデータURLとして持つ。
// 単体HTML(file://)で開いたときも /icon.svg に依存せず表示できるようにするため。
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
<rect width="512" height="512" rx="128" fill="url(#g)"/>
<path d="M158 132h196a44 44 0 0 1 44 44v120a44 44 0 0 1-44 44h-86l-66 60a8 8 0 0 1-13-6v-54h-31a44 44 0 0 1-44-44V176a44 44 0 0 1 44-44z" fill="#ffffff"/>
<circle cx="212" cy="238" r="22" fill="#3b82f6"/><circle cx="286" cy="238" r="22" fill="#2dd4bf"/><circle cx="360" cy="238" r="22" fill="#cbd5e1"/>
</svg>`

export const ICON_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`

/** ブランド表示名 */
export const APP_NAME = 'スマートピタ'
export const APP_TAGLINE = '冷蔵庫の紙をゼロにする、家族のためのスマート掲示板'
