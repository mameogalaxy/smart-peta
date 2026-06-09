# スマートピタ (smart-peta)

公開URL: https://mameogalaxy.github.io/smart-peta/

**「冷蔵庫の紙をゼロにする、家族のためのスマート掲示板」**

冷蔵庫に貼られがちな学校のプリント・ゴミの日カレンダー・買い物メモ・レシピの切り抜きを、
スマホで撮るだけでデジタル化。AI（Gemini）が文字を読み取って自動分類し、
QRコード1枚で家族全員が最新情報にアクセスできる、**書類管理 × 献立 × 共有**のオールインワンアプリです。

モバイルファーストの PWA（インストール不要・ブラウザで動作）として実装しています。

---

## ✨ コア機能

| 機能 | 説明 |
| --- | --- |
| 📷 **スマート書類スキャン & 自動分類** | プリントを撮影すると Gemini の OCR で文字を認識し、「学校 / ゴミの日 / レシピ / その他」へ自動でフォルダ分け。要約も生成。 |
| **QRコード生成 & 印刷 & 物理リンク** | 書類ごとに専用 QR を発行。**印刷ボタンで冷蔵庫に貼れる体裁の用紙を出力**。1枚貼れば家族はスマホで読み取るだけで最新版へ一発アクセス。PNG 保存・リンクコピーも可。 |
| 📅 **カレンダー・タスクの家族共有** | スキャンしたプリントから提出期限・行事の日付を自動抽出してカレンダー登録。担当者の割り当て・リマインダー対応。 |
| 🍳 **献立 & 買い物メモ連動** | レシピの切り抜きをスキャンして材料つきで保存。AI がその日の**学校給食と被らない夕食**を提案。材料はワンタップで買い物リストへ。 |
| 🛒 **買い物リストの家族共有** | レシピ・献立から材料を追加、チェックで購入管理、テキスト/Web共有で家族にシェア。 |

---

## 🧠 AI（Gemini）について

- 2026年の **Gemini 無料枠**（デフォルト `gemini-2.5-flash`）を利用します。
- API エンドポイント: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- 構造化出力（`responseSchema`）で OCR・分類・予定抽出・レシピ抽出・献立提案を JSON で受け取ります。
- **APIキーは端末内（localStorage）にのみ保存**され、Google 以外に送信されません。
- **APIキー未設定でもデモモードで全機能を体験**できます（サンプル結果を返します）。

### APIキーの設定
1. [Google AI Studio](https://aistudio.google.com/apikey) で無料の API キーを取得
2. アプリ右上の ⚙️ → 「Gemini APIキー」に貼り付け

---

## 🚀 セットアップ

```bash
npm install
npm run dev      # 開発サーバー（http://localhost:5173）
npm run build    # 本番ビルド（dist/）
npm run preview  # ビルド結果のプレビュー
```

スマホで試すには、同一ネットワーク上で `npm run dev` の Network URL を開いてください
（カメラ撮影は `localhost` か HTTPS 環境で動作します）。

---

## 🛠 技術スタック

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4**（モバイルファースト UI）
- **React Router v7**（QR から飛ぶ単体ビュー `/d/:id` を含む）
- **qrcode**（QR 生成）
- **localStorage** による永続化（バックエンド不要で動作）

## 📁 構成

```
src/
  pages/        Home / Documents / Calendar / Meals / Shopping / Settings / DocView
  components/   Layout(ボトムナビ+スキャンFAB) / ScanSheet / QrModal / ui / icons
  lib/
    store.tsx   localStorage 永続ストア（Context）
    gemini.ts   Gemini API 連携（OCR・分類・予定抽出・献立提案）
    demo.ts     APIキー無しでも動くデモ解析
    qr.ts       QR/共有URL
    util.ts     画像縮小・日付・ID など
  types.ts      ドメイン型
```

## 📝 メモ / 今後

現状はフロントエンド完結（端末ローカル保存）の MVP です。実運用で複数端末リアルタイム共有や
QR の他端末アクセスを実現するには、`lib/store.tsx` をバックエンド/DB 同期（例: Firebase, Supabase）へ
差し替えるのが拡張ポイントです。プッシュ通知リマインダーは Service Worker + Web Push で実装可能です。
