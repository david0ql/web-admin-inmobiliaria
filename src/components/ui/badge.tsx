import type { ReactNode } from 'react'

import { BadgeBase } from './misc'
import { cn } from '@/lib/utils'

/**
 * La etiqueta de estado. Dos modos:
 *
 * - `tone`, para los estados que conocemos: cada uno con su pareja de la paleta
 *   de Tailwind, igual que hace web-sell en routes/account.tsx.
 * - `color`, para los hexes que llegan de la API (etapas del embudo, etiquetas
 *   de inmueble). Ahi se pinta como contorno con punto y NO como relleno
 *   macizo: el color es arbitrario y con texto blanco encima no hay ninguna
 *   garantia de contraste. El relleno solido se reserva para donde el hex lo
 *   elegimos nosotros (la disponibilidad, en lib/format.ts).
 */
const TONES = {
  neutral: 'border-border bg-secondary text-secondary-foreground',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  ink: 'border-primary bg-primary text-primary-foreground',
} as const

export function Badge({
  children,
  tone = 'neutral',
  color,
}: {
  children: ReactNode
  tone?: keyof typeof TONES
  color?: string
}) {
  if (color) {
    return (
      // Color de runtime: Tailwind no puede generar una clase para un valor que
      // no existe en build time. `style` es lo correcto aqui, no un descuido.
      <BadgeBase variant="outline" className="gap-1.5" style={{ borderColor: color, color }}>
        <i
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        {children}
      </BadgeBase>
    )
  }
  return <BadgeBase className={cn('border', TONES[tone])}>{children}</BadgeBase>
}

/** Etiqueta maciza con color propio, para hexes que controlamos nosotros. */
export function TagBadge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <BadgeBase variant="tag" style={{ backgroundColor: color }}>
      {children}
    </BadgeBase>
  )
}
