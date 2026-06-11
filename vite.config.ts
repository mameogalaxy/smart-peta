import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
// `--mode single` のとき、すべてを1つの index.html にインライン化する
// （スマホで単体ファイルとして開けるビルド）。
const BUILD_ID = Date.now().toString()

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'single' ? [viteSingleFile()] : []),
    // 配信先に version.txt を置き、アプリが新バージョンを検知できるようにする
    {
      name: 'emit-version-txt',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.txt', source: BUILD_ID })
      },
    },
  ],
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
