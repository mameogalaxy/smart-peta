import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** 描画時エラーを白画面にせず、内容を画面に表示する */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg p-5 text-sm text-slate-800">
          <p className="font-bold text-red-600">画面の描画でエラーが発生しました</p>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-600">
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => location.reload()}
            className="mt-3 rounded-xl bg-brand-500 px-4 py-2 font-semibold text-white"
          >
            再読み込み
          </button>
          <p className="mt-2 text-xs text-slate-400">この内容をスクリーンショットで共有してください。</p>
        </div>
      )
    }
    return this.props.children
  }
}
