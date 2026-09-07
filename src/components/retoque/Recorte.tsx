import { marco, superficiePerdida, type Corte } from '@/lib/retoque';
import { cn } from '@/lib/utils';

/**
 * Cómo va a quedar la foto si se aplica el recorte. Antes de aplicarlo.
 *
 * Esta pieza existe por un dato medido, no por gusto: probando las propuestas
 * de recorte sobre 23 fotos reales, aplicadas al pie de la letra varias salían
 * PEOR —una perdía la ventana de una alcoba, otra mordía un espejo—, y eso solo
 * se vio renderizando los recortes y mirándolos. Leyendo el texto que los
 * describe, todas parecían razonables. «Recortar la cuarta parte de abajo, que
 * es suelo vacío» se lee impecable tanto cuando es verdad como cuando abajo no
 * había suelo vacío sino la mitad de un espejo.
 *
 * De ahí las dos vistas, y de ahí que la de la izquierda sea la que manda:
 *
 * - **Lo que se pierde**, sobre la foto entera y oscurecido. Es la vista que
 *   caza el error, porque enseña lo que se va a tirar todavía dentro de su
 *   contexto: la ventana que desaparece se ve ahí, no en el resultado.
 * - **Cómo queda**, ya recortada. Es la que responde a «¿y esto mejora?».
 *
 * No llama a la API ni cuesta nada: los porcentajes por borde bastan para
 * dibujarlo exacto sobre la miniatura que ya está cargada. Así que no hay
 * ningún motivo para que un recorte se aplique sin que esto se haya visto.
 */
export function Recorte({
  url,
  alt,
  cortes,
  className,
}: {
  url: string;
  alt: string;
  cortes: Corte[];
  className?: string;
}) {
  const m = marco(cortes);
  const perdido = superficiePerdida(cortes);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <figure className="flex flex-col gap-1">
          <figcaption className="micro-label text-muted-foreground">
            Lo que se pierde
          </figcaption>
          <div className="relative overflow-hidden rounded-md bg-secondary">
            <img
              src={url}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block w-full object-contain"
            />
            {/*
              Las cuatro franjas que se van, oscurecidas sobre la foto entera.
              Cuatro rectángulos y no un `box-shadow` de un solo hueco porque
              así cada borde lleva su propio contorno: cuando el modelo propone
              cortar solo abajo, se ve que solo se toca abajo.
            */}
            {(['arriba', 'abajo', 'izquierda', 'derecha'] as const).map((lado) =>
              m[lado] > 0 ? <Franja key={lado} lado={lado} porcion={m[lado]} /> : null,
            )}
            {/* La línea del corte, para que el borde se lea también donde la
                foto ya es oscura y el velo no se distingue. */}
            <span
              className="pointer-events-none absolute border border-dashed border-white/90"
              style={{
                top: `${m.arriba}%`,
                bottom: `${m.abajo}%`,
                left: `${m.izquierda}%`,
                right: `${m.derecha}%`,
              }}
              aria-hidden
            />
          </div>
        </figure>

        <figure className="flex flex-col gap-1">
          <figcaption className="micro-label text-muted-foreground">Cómo queda</figcaption>
          <div className="relative overflow-hidden rounded-md bg-secondary">
            {/*
              El recorte de verdad: la misma imagen escalada y desplazada para
              que solo se vea lo que queda dentro. Es una vista fiel, no una
              aproximación — el navegador recorta los mismos porcentajes que
              recortará el servidor.
            */}
            <div
              className="w-full overflow-hidden"
              style={{ aspectRatio: `${100 - m.izquierda - m.derecha} / ${100 - m.arriba - m.abajo}` }}
            >
              <img
                src={url}
                alt={`${alt}, ya recortada`}
                loading="lazy"
                decoding="async"
                className="block max-w-none origin-top-left"
                style={{
                  width: `${(100 / (100 - m.izquierda - m.derecha)) * 100}%`,
                  marginLeft: `${(-m.izquierda / (100 - m.izquierda - m.derecha)) * 100}%`,
                  marginTop: `${(-m.arriba / (100 - m.arriba - m.abajo)) * 100}%`,
                  height: `${(100 / (100 - m.arriba - m.abajo)) * 100}%`,
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>
        </figure>
      </div>

      {/* Cuánto se tira, en un número. «Recortar un poco abajo» y «tirar el 28%
          de la foto» son la misma frase para el modelo y dos decisiones
          distintas para quien la publica. */}
      <p className="tabular text-xs text-muted-foreground">
        Se tira el {perdido}% de la foto.
      </p>
    </div>
  );
}

function Franja({
  lado,
  porcion,
}: {
  lado: 'arriba' | 'abajo' | 'izquierda' | 'derecha';
  porcion: number;
}) {
  const estilo =
    lado === 'arriba'
      ? { top: 0, left: 0, right: 0, height: `${porcion}%` }
      : lado === 'abajo'
        ? { bottom: 0, left: 0, right: 0, height: `${porcion}%` }
        : lado === 'izquierda'
          ? { top: 0, bottom: 0, left: 0, width: `${porcion}%` }
          : { top: 0, bottom: 0, right: 0, width: `${porcion}%` };
  return (
    <span
      className="pointer-events-none absolute bg-red-950/65"
      style={estilo}
      aria-hidden
    />
  );
}
