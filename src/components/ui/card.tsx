import type { ReactNode } from 'react'

import { CardShell } from './misc'
import { cn } from '@/lib/utils'

/**
 * El envoltorio de bloque del panel: cabecera opcional con titulo y accion, y
 * cuerpo con o sin relleno. Por dentro es el `Card` de web-sell, asi que emite
 * `data-slot="card"` — de eso depende el `Pager` para saber a que subir el
 * scroll.
 */
export function Card({
  title,
  action,
  children,
  flush,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <CardShell className={className}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          {typeof title === 'string' ? (
            <h3 className="micro-label">{title}</h3>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      <div className={cn(!flush && 'p-5')}>{children}</div>
    </CardShell>
  )
}
