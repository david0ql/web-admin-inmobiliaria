import type { ReactNode } from 'react'

/**
 * El historial de un cliente. El conector es un pseudoelemento del propio
 * item, no un elemento aparte: `not-last` evita que el ultimo pinte una linea
 * colgando hacia abajo.
 */
export function Timeline({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>
}

export function TimelineItem({
  mark,
  children,
}: {
  mark?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative grid grid-cols-[17px_1fr] gap-3 pb-4 not-last:before:absolute not-last:before:top-[18px] not-last:before:bottom-0 not-last:before:left-2 not-last:before:w-px not-last:before:bg-input">
      <span className="z-1 mt-px grid size-[17px] place-items-center rounded-full border border-input bg-card text-[9px]">
        {mark}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
