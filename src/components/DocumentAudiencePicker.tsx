import type { FamilyMember } from '../types'
import { Avatar } from './Avatar'
import { UsersIcon } from './icons'

export function DocumentAudiencePicker({
  family,
  value,
  onChange,
}: {
  family: FamilyMember[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const all = value.length === 0

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-slate-600">対象</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
            all ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <UsersIcon width={17} height={17} /> 家族全員
        </button>
        {family.map((member) => {
          const selected = value.includes(member.id)
          return (
            <button
              type="button"
              key={member.id}
              onClick={() => {
                const next = selected ? value.filter((id) => id !== member.id) : [...value, member.id]
                onChange(next)
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                selected ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Avatar member={member} size={18} /> {member.name}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-xs text-slate-400">複数人を選択できます。未選択は家族全員です。</p>
    </div>
  )
}
