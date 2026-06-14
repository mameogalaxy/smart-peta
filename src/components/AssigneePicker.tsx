import { Avatar } from './Avatar'
import { ALL_MEMBERS, type FamilyMember } from '../types'

/** 複数選択できる担当ピッカー（全員＝'*' を含む。空＝未割当） */
export function AssigneePicker({
  family,
  value,
  onChange,
  memberId,
}: {
  family: FamilyMember[]
  value: string[]
  onChange: (v: string[]) => void
  memberId?: string
}) {
  const allOn = value.includes(ALL_MEMBERS)
  function toggle(id: string) {
    if (id === ALL_MEMBERS) {
      onChange(allOn ? [] : [ALL_MEMBERS])
      return
    }
    const base = value.filter((x) => x !== ALL_MEMBERS)
    onChange(base.includes(id) ? base.filter((x) => x !== id) : [...base, id])
  }
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => toggle(ALL_MEMBERS)} className={chip(allOn)}>
        全員
      </button>
      {family.map((f) => {
        const isSelf = f.id === memberId
        return (
          <button key={f.id} onClick={() => toggle(f.id)} className={chip(!allOn && value.includes(f.id))}>
            <Avatar member={f} size={18} /> {isSelf ? `${f.name}(自分)` : f.name}
          </button>
        )
      })}
    </div>
  )
}
