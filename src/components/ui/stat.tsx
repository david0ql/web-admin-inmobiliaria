import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * La cifra destacada. El tema anterior la dibujaba como una cota de plano —un
 * tramo medido con marcas en los extremos— pero eso pertenecia a la identidad
 * vieja; aqui es la anatomia de tarjeta de web-sell: rotulo, cifra grande y una
 * banda inferior separada por una linea con el matiz.
 */
const TONE = {
  neutral: 'text-muted-foreground',
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-destructive',
} as const

export function Stat({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  note?: string
  tone?: keyof typeof TONE
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card shadow-sm">
      <div className="p-5 pb-4">
        <span className="micro-label text-muted-foreground">{label}</span>
        <span className="tabular mt-1.5 block truncate text-2xl leading-none font-semibold tracking-tight">
          {value}
        </span>
      </div>
      <div className={cn('border-t px-5 py-2.5 text-xs', TONE[tone])}>
        {note ?? '—'}
      </div>
    </div>
  )
}
