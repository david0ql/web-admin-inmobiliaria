/**
 * Llevar la vista al arranque de una lista al cambiar de pagina.
 *
 * Sin esto, cambiar de pagina en una tabla de 25 filas deja al usuario en el
 * pie de la anterior — o, si el navegador restaura el scroll, en el top de la
 * pantalla, con la cabecera y los filtros por delante. Lo util es la primera
 * fila de lo que acaba de pedir.
 */

/** Aire por encima de la lista, para que no quede pegada al borde. */
const GAP = 16

export function scrollToTopOf(element: Element | null): void {
  if (!element) return

  const top = Math.max(
    element.getBoundingClientRect().top + window.scrollY - GAP,
    0,
  );

  const distance = Math.abs(top - window.scrollY);

  window.scrollTo({
    top,
    // Un recorrido largo animado se vuelve un viaje; y si el sistema pide
    // menos movimiento, no se anima nunca.
    behavior:
      distance > window.innerHeight * 2 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
  });
}
