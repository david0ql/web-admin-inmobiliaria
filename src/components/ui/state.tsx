import type { ReactNode } from 'react'

import { Button } from './button'
import { Skeleton } from './misc'
import { cn } from '@/lib/utils'

/**
 * Vacio, cargando y error. Los tres estados que toda pantalla con datos tiene
 * que saber pintar.
 */

const ALERT_TONE = {
  error: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
} as const

export function Alert({
  tone = 'error',
  children,
  action,
  className,
}: {
  tone?: keyof typeof ALERT_TONE
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm',
        ALERT_TONE[tone],
        className,
      )}
    >
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  )
}

export function ErrorNote({
  children,
  onRetry,
}: {
  children: ReactNode
  onRetry?: () => void
}) {
  return (
    <Alert
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
    >
      {children}
    </Alert>
  )
}

/*
  El bloque punteado de web-sell. Ojo al colocarlo: NO va dentro de un `Card`,
  porque el borde de la tarjeta y el punteado se leen como dos marcos.
*/
export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-5 py-16 text-center">
      <p className="font-medium">{title}</p>
      {children && (
        <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      )}
      {action}
    </div>
  )
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
