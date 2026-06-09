import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Modal, Button } from '../components/ui'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>

const Ctx = createContext<ConfirmFn | null>(null)

/**
 * window.confirm の代替となるアプリ内確認ダイアログ。
 * （ホーム画面に追加したPWA等では window.confirm が無効化され動かないため）
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})

  const confirm = useCallback<ConfirmFn>((o) => {
    const options = typeof o === 'string' ? { message: o } : o
    setOpts(options)
    return new Promise<boolean>((res) => {
      resolver.current = res
    })
  }, [])

  function close(v: boolean) {
    resolver.current(v)
    setOpts(null)
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} title={opts?.title ?? '確認'}>
        <p className="text-sm leading-relaxed text-slate-600">{opts?.message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => close(false)}>
            {opts?.cancelLabel ?? 'キャンセル'}
          </Button>
          <Button
            variant={opts?.danger ? 'dangerSolid' : 'primary'}
            className="flex-1"
            onClick={() => close(true)}
          >
            {opts?.confirmLabel ?? '削除'}
          </Button>
        </div>
      </Modal>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmFn {
  const c = useContext(Ctx)
  if (!c) throw new Error('useConfirm must be used within ConfirmProvider')
  return c
}
