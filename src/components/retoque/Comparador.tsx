import { useId, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * El antes y el después, uno encima del otro y con una cortina en medio.
 *
 * De las tres formas posibles esta es la única que responde a la pregunta que
 * de verdad se hace quien mira, que no es «¿cómo ha quedado?» sino «¿está
 * mejor?»:
 *
 * - **Lado a lado** parte el ancho en dos. En el móvil de un asesor eso deja
 *   dos fotos de 160 px, y a ese tamaño un cuarto de punto de exposición no se
 *   ve. Además el ojo tiene que saltar, y comparar saltando es justo lo que se
 *   nos da mal: media diferencia se pierde en el viaje.
 * - **Pulsar para alternar** conserva el tamaño pero cambia las dos imágenes de
 *   sitio en el tiempo, así que exige memoria. Funciona para «¿ha cambiado
 *   algo?» y falla para «¿el techo sigue torcido?».
 * - **La cortina** deja las dos en el mismo sitio, al mismo tamaño, y el borde
 *   pasa por encima del detalle que se está mirando. La diferencia se ve en la
 *   costura, sin mover los ojos y sin recordar nada.
 *
 * La cortina es un `input[type=range]` de verdad, invisible pero presente. Con
 * un `div` y `pointermove` habría salido más corto, y habría dejado fuera el
 * teclado, el lector de pantalla y el arrastre táctil con inercia — tres cosas
 * que el navegador ya sabe hacer con un deslizador y que aquí no hay ningún
 * motivo para reescribir.
 *
 * El botón de al lado no es un adorno: en una pantalla de 360 px la cortina se
 * maneja con el pulgar tapando justo lo que hay que ver, y a veces lo que se
 * quiere es la foto entera de un lado. Llevar la cortina al extremo con el dedo
 * es incómodo; pulsar un botón, no.
 */
export function Comparador({
  antes,
  despues,
  alt,
  etiquetaAntes = 'Original',
  etiquetaDespues = 'Revelada',
  className,
}: {
  antes: string;
  despues: string;
  alt: string;
  etiquetaAntes?: string;
  etiquetaDespues?: string;
  className?: string;
}) {
  /* Empieza a la mitad: es la posición desde la que se ven los dos lados sin
     tener que tocar nada, y desde la que se entiende que hay dos lados. */
  const [corte, setCorte] = useState(50);
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/*
        `min-h` y carga ansiosa, las dos por el mismo motivo: este bloque solo
        se monta al abrir el dialogo, asi que `lazy` no ahorra ninguna descarga
        —la foto se va a pedir igual— y mientras no habia llegado el contenedor
        se quedaba a cero de alto. El resultado era un dialogo con los botones
        de la cortina y ninguna foto encima, que es exactamente lo contrario de
        lo que esta pieza existe para hacer.
      */}
      <div className="relative min-h-40 overflow-hidden rounded-md bg-secondary select-none">
        {/*
          El «después» va debajo y entero. Es el que manda el alto del bloque, y
          es el que se queda si el «antes» tardase en llegar: enseñar de más lo
          ya revelado es preferible a enseñar de más lo que se iba a cambiar.
        */}
        <img
          src={despues}
          alt={alt}
          loading="eager"
          decoding="async"
          draggable={false}
          className="block max-h-[52dvh] w-full object-contain sm:max-h-[60dvh]"
        />

        {/*
          El «antes» encima, recortado por la izquierda. `clip-path` y no un
          `width` sobre el contenedor: recortando el contenedor la imagen se
          reescalaría al moverse la cortina, y las dos mitades dejarían de estar
          alineadas — que es lo único que este componente tiene que garantizar.
        */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - corte}% 0 0)` }}
          aria-hidden
        >
          <img
            src={antes}
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
            className="block max-h-[52dvh] w-full object-contain sm:max-h-[60dvh]"
          />
        </div>

        {/* La costura. Blanca con sombra para que se vea igual sobre un techo
            claro y sobre un mueble oscuro. */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${corte}%` }}
          aria-hidden
        >
          <span className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-md">
            <span className="text-[0.7rem] leading-none font-bold text-neutral-700">
              ‹ ›
            </span>
          </span>
        </div>

        <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
          {etiquetaAntes}
        </span>
        <span className="pointer-events-none absolute top-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
          {etiquetaDespues}
        </span>

        {/*
          El deslizador ocupa la foto entera y es transparente: se arrastra
          desde cualquier punto de la imagen, que es donde la mano va sola. El
          pulgar de verdad es el círculo pintado arriba.
        */}
        <label htmlFor={id} className="sr-only">
          Cortina entre {etiquetaAntes.toLowerCase()} y {etiquetaDespues.toLowerCase()}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={corte}
          onChange={(e) => setCorte(Number(e.target.value))}
          aria-valuetext={`${corte}% ${etiquetaAntes.toLowerCase()}`}
          className="absolute inset-0 size-full cursor-ew-resize appearance-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent"
        />
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <BotonLado activo={corte >= 99} onClick={() => setCorte(100)}>
          Solo {etiquetaAntes.toLowerCase()}
        </BotonLado>
        <BotonLado activo={corte > 1 && corte < 99} onClick={() => setCorte(50)}>
          Comparar
        </BotonLado>
        <BotonLado activo={corte <= 1} onClick={() => setCorte(0)}>
          Solo {etiquetaDespues.toLowerCase()}
        </BotonLado>
      </div>
    </div>
  );
}

function BotonLado({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs transition-colors',
        activo ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary',
      )}
    >
      {children}
    </button>
  );
}
