import type { FamilyMember } from '../types'

/** 家族メンバーのアバター（頭文字を色付き円で表示・絵文字不使用） */
export function Avatar({ member, size = 28 }: { member: Pick<FamilyMember, 'name' | 'color'>; size?: number }) {
  const initial = [...member.name][0] ?? '?'
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: member.color, fontSize: size * 0.42 }}
      aria-label={member.name}
    >
      {initial}
    </span>
  )
}
