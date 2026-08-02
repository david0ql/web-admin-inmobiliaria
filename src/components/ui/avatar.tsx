import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Iniciales sobre gris, o la foto si la hay. Igual que el de web-sell. */
export function Avatar({
  name,
  src,
  large,
}: {
  name: string
  src?: string | null
  large?: boolean
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-medium text-secondary-foreground',
        large ? 'size-12 text-base' : 'size-8 text-xs',
      )}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name || '?')
      )}
    </span>
  )
}
