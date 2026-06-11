/// <reference types="vite/client" />

/** ビルドごとに一意のID（バージョン更新検知に使用）。vite.config の define で注入 */
declare const __BUILD_ID__: string
