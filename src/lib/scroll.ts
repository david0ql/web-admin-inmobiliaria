/**
 * Llevar la vista al arranque de una lista al cambiar de pagina.
 *
 * Sin esto, cambiar de pagina en una tabla de 25 filas deja al usuario en el
 * pie de la anterior — o, si el navegador restaura el scroll, en el top de la
 * pantalla, con la cabecera y los filtros por delante. Lo util es la primera
 * fila de lo que acaba de pedir.
 *
 * No se usa `scrollIntoView`: la cabecera de pagina es `sticky`, asi que hay
 * que descontar su alto a mano o tapa las primeras filas. Se mide en cada
 * llamada porque el alto cambia — el titulo puede envolver, y en movil la fila
 * de acciones baja.
 */

/** Aire entre la cabecera fija y lo primero de la lista. */
const GAP = 16

function stickyOffset(): number {
  const header = document.querySelector<HTMLElement>('[data-page-header]')
  return (header?.offsetHeight ?? 0) + GAP
}

export function scrollToTopOf(element: Element | null): void {
  if (!element) return

  const top = Math.max(
    element.getBoundingClientRect().top + window.scrollY - stickyOffset(),
    0,
  )

  const distance = Math.abs(top - window.scrollY)

  window.scrollTo({
    top,
    // Un recorrido largo animado se vuelve un viaje; y si el sistema pide
    // menos movimiento, no se anima nunca.
    behavior:
      distance > window.innerHeight * 2 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
  })
}
