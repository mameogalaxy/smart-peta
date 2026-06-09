// 公開アプリ共通の Firebase 設定（全ユーザーが使う既定のバックエンド）。
// apiKey は公開Webアプリでは秘密情報ではなく、アクセス制御はFirestoreのセキュリティルールで担保する。
// これを設定しておくと、エンドユーザーは Firebase 設定が不要になる（世帯の作成/参加だけでOK）。
export const DEFAULT_FIREBASE_CONFIG: Record<string, string> = {
  apiKey: 'AIzaSyDT3kYU7-iq2uNiS2YN7h2t1_tDTQgkjD0',
  authDomain: 'smartpita-dbcf8.firebaseapp.com',
  projectId: 'smartpita-dbcf8',
  storageBucket: 'smartpita-dbcf8.firebasestorage.app',
  messagingSenderId: '931289639351',
  appId: '1:931289639351:web:0c067c22caba8910b22032',
  measurementId: 'G-TM5Q62Y2PJ',
}

export const HAS_DEFAULT_FIREBASE = Boolean(DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.projectId)
