import type { SVGProps } from 'react'
import type { DocCategory } from '../types'
import { BoltIcon, BookIcon, BriefcaseIcon, DocIcon, MealIcon, SchoolIcon, TrashIcon } from './icons'

const MAP: Record<DocCategory, (p: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  school: SchoolIcon,
  garbage: TrashIcon,
  recipe: MealIcon,
  utility: BoltIcon,
  manual: BookIcon,
  work: BriefcaseIcon,
  other: DocIcon,
}

/** カテゴリに対応するライン系アイコン（絵文字の代替） */
export function CategoryIcon({
  cat,
  size = 20,
  className,
}: {
  cat: DocCategory
  size?: number
  className?: string
}) {
  const Icon = MAP[cat]
  return <Icon width={size} height={size} className={className} />
}
