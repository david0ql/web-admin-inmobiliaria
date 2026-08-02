import type { ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { cn } from '@/lib/utils'

/**
 * El modal del panel. Mismas props que antes, Radix por dentro.
 *
 * Ya no hay listener de Escape ni `document.body.style.overflow = 'hidden'`:
 * de las dos cosas se encarga Radix. Mantener ademas el bloqueo manual daba un
 * doble candado — al desmontar, el `overflow = ''` pisaba lo que Radix habia
 * restaurado y la pagina se quedaba sin scroll tras cerrar el segundo modal. Y
 * como el rail movil tambien es un Dialog, ese candado huerfano dejaba
 * bloqueada la aplicacion entera.
 *
 * Todos los sitios de llamada son `{abierto && <Modal .../>}`, asi que montar
 * un Dialog permanentemente abierto es exactamente lo correcto.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={cn('gap-0 p-0', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70dvh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <DialogFooter className="border-t px-5 py-3.5">{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
