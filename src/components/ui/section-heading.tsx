import { cn } from '@/lib/utils'

/**
 * El rotulo de seccion del tema: la primera palabra fina, la segunda en negrita
 * y la barra corta debajo (`.tt-square`).
 *
 * Copiado de web-sell/src/components/common/section-heading.tsx, sin cambios.
 */
export function SectionHeading({
  light,
  strong,
  as: Tag = 'h2',
  className,
}: {
  light: string
  strong?: string
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}) {
  return (
    <div className={cn('mb-6', className)}>
      <Tag className="tt-square text-xl font-light tracking-wide uppercase sm:text-2xl">
        {light} {strong && <strong className="font-bold">{strong}</strong>}
      </Tag>
    </div>
  )
}
