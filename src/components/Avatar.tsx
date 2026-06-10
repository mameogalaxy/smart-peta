import type { FamilyMember } from '../types'

/** 家族メンバーのアバター。写真があれば写真、無ければ頭文字＋色（絵文字不使用）。 */
export function Avatar({ member, size = 28 }: { member: Pick<FamilyMember, 'name' | 'color' | 'photo'>; size?: number }) {
  if (member.photo) {
    return (
      <img
        src={member.photo}
        alt={member.name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
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
