import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useEffect } from 'react'
import { CloseIcon } from './icons'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 ${
        onClick ? 'cursor-pointer active:scale-[0.99] transition' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

type BtnVariant = 'primary' | 'ghost' | 'soft' | 'danger' | 'dangerSolid'
export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-brand-500 text-white shadow-sm active:bg-brand-600 disabled:opacity-50',
    ghost: 'bg-transparent text-slate-600 active:bg-slate-100',
    soft: 'bg-brand-50 text-brand-700 active:bg-brand-100',
    danger: 'bg-red-50 text-red-600 active:bg-red-100',
    dangerSolid: 'bg-red-500 text-white shadow-sm active:bg-red-600',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  color = '#64748b',
}: {
  children: ReactNode
  color?: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      {children}
    </span>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-bold text-slate-500">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-600">{title}</p>
      {desc && <p className="mt-1 max-w-xs text-sm text-slate-400">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-pop safe-bottom relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 active:bg-slate-100">
            <CloseIcon width={22} height={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width={20} height={20} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
