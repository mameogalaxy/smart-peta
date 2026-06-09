// アプリのアイコンをインラインのデータURLとして持つ。
// 単体HTML(file://)で開いたときも /icon.svg に依存せず表示できるようにするため。
// ロゴ＝ブルー→ティールのチャットバブル（白抜き）＋左下のしっぽ＋右上のキラッと線。
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="spg" x1="0.18" y1="0.02" x2="0.82" y2="1"><stop offset="0" stop-color="#5a78fb"/><stop offset="0.5" stop-color="#3f8ef1"/><stop offset="1" stop-color="#26c7dd"/></linearGradient></defs>
<g fill="url(#spg)"><path fill-rule="evenodd" d="M70 262a158 158 0 1 0 316 0a158 158 0 1 0-316 0ZM134 262a94 94 0 1 1 188 0a94 94 0 1 1-188 0Z"/><path d="M150 348Q96 432 112 452Q152 438 206 372Z"/></g>
<g stroke="url(#spg)" stroke-width="22" stroke-linecap="round" fill="none"><path d="M398 92 414 54"/><path d="M432 148 472 118"/><path d="M434 200 480 196"/></g>
</svg>`

export const ICON_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`

/** ブランド表示名 */
export const APP_NAME = 'スマートピタ'
export const APP_TAGLINE = '冷蔵庫の紙をゼロにする、家族のためのスマート掲示板'
