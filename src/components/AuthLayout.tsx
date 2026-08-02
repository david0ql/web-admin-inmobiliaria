import type { ReactNode } from 'react';

/**
 * La pantalla partida del acceso: a la izquierda la marca sobre negro, a la
 * derecha el formulario sobre blanco.
 *
 * El panel oscuro es la misma tinta que el rail y que la barra superior del
 * sitio publico. Conserva la reticula de plano (`.blueprint`) del tema
 * anterior: es lo unico de aquella identidad que valia la pena mantener, y
 * sobre el negro funciona mejor que sobre el verde.
 *
 * Por debajo de 992px el panel no se muestra — en movil es un anuncio que
 * empuja el formulario fuera de pantalla.
 */
export function AuthLayout({
  eyebrow,
  title,
  lede,
  aside,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="blueprint relative hidden flex-col justify-between overflow-hidden border-t-4 border-rail-line bg-rail p-11 text-white lg:flex">
        <div className="relative z-1">
          <span className="note text-white/50">{eyebrow}</span>
          <h1 className="mt-2.5 text-4xl leading-tight font-semibold tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-3.5 max-w-[34ch] text-sm text-white/70">{lede}</p>
        </div>
        {aside && <div className="relative z-1">{aside}</div>}
      </aside>

      <main className="grid place-items-center bg-background px-6 py-10">
        <div className="w-full max-w-[352px]">{children}</div>
      </main>
    </div>
  );
}

/** Una cifra de la columna de marca. */
export function AuthFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="tabular block text-2xl leading-none font-medium tracking-tight text-white">
        {value}
      </b>
      <span className="note text-white/50">{label}</span>
    </div>
  );
}
