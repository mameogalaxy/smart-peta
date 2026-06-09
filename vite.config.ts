import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
// `--mode single` のとき、すべてを1つの index.html にインライン化する
// （スマホで単体ファイルとして開けるビルド）。
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    // ファイル名を固定（ハッシュ無し）にして、デプロイ後に古いHTMLが
    // 消えたハッシュ付きJSを読みに行って真っ白になる問題を防ぐ。
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    host: true,
  },
}))
