import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from './button'
import { scrollToTopOf } from '@/lib/scroll'

/**
 * El pie de una lista paginada.
 *
 * El pager va al pie de la tarjeta de resultados, asi que la tarjeta es la
 * lista: subir a su borde deja la primera fila a la vista. Resolverlo aqui y no
 * en cada pantalla evita que la proxima tabla nazca con el mismo salto.
 *
 * El ancla se busca por `[data-slot="card"]`, que es el atributo que emite el
 * Card copiado de web-sell. Antes se buscaba por `.card`; al desaparecer esa
 * clase el `closest` habria devuelto `null` y el scroll se habria ido al propio
 * pager — es decir, al final de la lista — sin ningun error que lo delatara.
 */
export function Pager({
  page,
  pages,
  total,
  unit,
  onPage,
}: {
  page: number
  pages: number
  total: number
  unit: string
  onPage: (page: number) => void
}) {
  const root = useRef<HTMLDivElement>(null)

  function go(next: number) {
    onPage(next)
    const list = root.current?.closest('[data-slot="card"]') ?? root.current
    requestAnimationFrame(() => scrollToTopOf(list))
  }

  if (total === 0) return null
  return (
    <div
      ref={root}
      className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3"
    >
      <span className="note tabular">
        {total.toLocaleString('es-CO')} {unit} · página {page} de{' '}
        {Math.max(pages, 1)}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => go(page + 1)}
        >
          Siguiente
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
