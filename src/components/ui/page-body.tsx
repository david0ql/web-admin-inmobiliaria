import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** El cuerpo de una pantalla: el aire y el ritmo vertical, una sola vez. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-1 flex-col gap-5 px-4 pt-6 pb-16 lg:px-8', className)}
    >
      {children}
    </div>
  )
}
