import {
  Camera,
  Crop,
  Eraser,
  Eye,
  Focus,
  Lightbulb,
  Maximize2,
  PanelTopDashed,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui';
import {
  aspectoEnPalabras,
  partir,
  type MetricasImagen,
  type Severidad,
  type Sugerencia,
} from '@/lib/retoque';
import { cn } from '@/lib/utils';

/**
 * Lo que habría que hacerle a una foto, en dos listas y no en una.
 *
 * Es la decisión de diseño de esta pieza y no es cosmética: las dos listas
 * tienen destinatarios distintos y en un listado mezclado ninguno de los dos
 * puede usar la suya. Lo de arriba lo ejecuta un botón; lo de abajo lo lee una
 * persona que tiene que ir a mirar algo.
 *
 * El reparto lo hace el servidor con `destino`, nunca este fichero. Deducirlo
 * del código significaría que un código nuevo cae en el cubo equivocado sin dar
 * error, y el cubo equivocado es o prometer que un botón endereza una foto
 * movida, o mandar a alguien a cruzar la ciudad por un recorte.
 *
 * El rótulo de abajo dice «lo mira una persona» y no «volver a la casa», que es
 * lo que decía antes. El bloque lleva dos cosas que no son la misma: las que
 * exigen coger el coche —desorden, falta de luz, repetir la toma— y los
 * recortes que el modelo propuso sin que el código los confirme, que solo piden
 * que alguien MIRE la foto desde donde está. Con el rótulo antiguo, la mitad de
 * las entradas quedaban mal encuadradas y la lista dejaba de ser de nadie: cada
 * una de esas dos cosas se lee entera en su propio título.
 */

/** Solo para el icono. Un código que no esté aquí pinta el genérico y ya. */
const ICONOS: Record<string, LucideIcon> = {
  RECORTE: Crop,
  SUELO: ScanLine,
  TECHO: PanelTopDashed,
  PARED: Maximize2,
  MOVIDA: Focus,
  LUZ: Lightbulb,
  DESORDEN: Eraser,
  REVISITA: Camera,
};

const SEVERIDAD_TONO: Record<Severidad, 'red' | 'amber' | 'neutral'> = {
  ALTA: 'red',
  MEDIA: 'amber',
  BAJA: 'neutral',
};

const SEVERIDAD_TEXTO: Record<Severidad, string> = {
  ALTA: 'Se nota',
  MEDIA: 'Mejorable',
  BAJA: 'Detalle',
};

export function ListasPropuesta({
  sugerencias,
  metricas,
  /** El botón que enseña el recorte. Va SOLO en la lista de arriba. */
  accionAuto,
}: {
  sugerencias: Sugerencia[];
  metricas: MetricasImagen | null;
  accionAuto?: React.ReactNode;
}) {
  const { auto, revisita } = partir(sugerencias);

  return (
    <div className="flex flex-col gap-4">
      {metricas && <Medidas metricas={metricas} />}

      {/*
        El bloque de arriba se pinta SIEMPRE, también vacío, y esto es
        deliberado. Sobre 23 fotos reales solo 8 tenían un recorte confirmado, y
        entre dos ejecuciones idénticas del mismo prompt el número varió: el
        modelo es conservador de forma irregular. Con el bloque escondido, «no
        hay nada automático» y «esto todavía no ha corrido» se ven igual; con
        una frase, el vacío es una respuesta y no un hueco.
      */}
      <Bloque
        titulo="Esto lo puede hacer el sistema"
        ayuda="Solo entra aquí un recorte que el código haya confirmado midiendo los píxeles del borde. Aun así se mira antes de aplicarlo."
        icono={Crop}
        tono="ok"
        accion={auto.length > 0 ? accionAuto : undefined}
        vacio="Nada que el sistema pueda arreglar solo en esta foto. Es lo habitual: solo pasa el corte que el código confirma."
      >
        {auto.map((s) => (
          <Linea key={s.id} sugerencia={s} />
        ))}
      </Bloque>

      {revisita.length > 0 && (
        <Bloque
          titulo="Esto lo mira una persona"
          ayuda="Unas piden volver a la casa —falta luz, hay que mover cosas, hay que repetir la toma— y otras solo que alguien mire la foto antes de tocarla. Cada una lo dice."
          icono={Eye}
          tono="aviso"
        >
          {revisita.map((s) => (
            <Linea key={s.id} sugerencia={s} />
          ))}
        </Bloque>
      )}
    </div>
  );
}

/**
 * Lo medido, delante de lo opinado.
 *
 * «Muy apaisada» no se puede discutir; «1,50:1» sí. Y cuando el asesor cree que
 * la propuesta se equivoca, el número es lo único que le deja comprobarlo sin
 * abrir la foto en otro programa.
 *
 * La nitidez va con su reserva escrita al lado, y no es un adorno: en este
 * inventario las salas VACÍAS de pared blanca lisa hunden la varianza y
 * puntúan como movidas estando perfectamente enfocadas. Un número bajo aquí
 * pintado a secas haría que un asesor volviera a una casa a repetir una foto
 * impecable.
 */
function Medidas({ metricas }: { metricas: MetricasImagen }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {metricas.anchura} × {metricas.altura} px
        </span>
        <span>Proporción {aspectoEnPalabras(metricas.aspecto)}</span>
        {metricas.nitidez !== null && <span>Nitidez {Math.round(metricas.nitidez)}</span>}
        {metricas.brillo !== null && <span>Luz {Math.round(metricas.brillo)}/255</span>}
      </p>
      {metricas.nitidez !== null && metricas.nitidez < 100 && (
        <p className="text-xs text-muted-foreground">
          Nitidez baja no siempre es una foto movida: una sala vacía de pared blanca
          lisa puntúa igual de bajo estando bien enfocada. Míralo antes de repetirla.
        </p>
      )}
    </div>
  );
}

function Bloque({
  titulo,
  ayuda,
  icono: Icono,
  tono,
  accion,
  vacio,
  children,
}: {
  titulo: string;
  ayuda: string;
  icono: LucideIcon;
  tono: 'ok' | 'aviso';
  accion?: React.ReactNode;
  /** Qué decir cuando no hay ninguna. Sin esto, vacío se lee como roto. */
  vacio?: string;
  children: React.ReactNode[];
}) {
  const vacia = children.length === 0;
  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3',
        vacia
          ? 'border-border bg-secondary/40'
          : tono === 'ok'
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-amber-200 bg-amber-50/60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <Icono
            className={cn(
              'mt-0.5 size-4 shrink-0',
              vacia
                ? 'text-muted-foreground'
                : tono === 'ok'
                  ? 'text-emerald-700'
                  : 'text-amber-700',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <h4
              className={cn(
                'text-sm font-medium',
                vacia
                  ? 'text-muted-foreground'
                  : tono === 'ok'
                    ? 'text-emerald-900'
                    : 'text-amber-900',
              )}
            >
              {titulo}
            </h4>
            <p
              className={cn(
                'text-xs',
                vacia
                  ? 'text-muted-foreground'
                  : tono === 'ok'
                    ? 'text-emerald-800'
                    : 'text-amber-800',
              )}
            >
              {vacia ? vacio : ayuda}
            </p>
          </div>
        </div>
        {accion && <span className="shrink-0">{accion}</span>}
      </div>

      {!vacia && <ul className="flex list-none flex-col gap-1.5 p-0">{children}</ul>}
    </section>
  );
}

function Linea({ sugerencia }: { sugerencia: Sugerencia }) {
  const Icono = ICONOS[sugerencia.codigo] ?? Sparkles;
  return (
    <li className="flex items-start gap-1.5 text-sm">
      <Icono className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        {/* Redactado en español por el servidor: se pinta tal cual. */}
        <span className="font-medium">{sugerencia.titulo}</span>{' '}
        <span className="align-middle">
          <Badge tone={SEVERIDAD_TONO[sugerencia.severidad] ?? 'neutral'}>
            {SEVERIDAD_TEXTO[sugerencia.severidad] ?? sugerencia.severidad}
          </Badge>
        </span>
        {sugerencia.detalle && (
          <span className="block text-xs text-muted-foreground">{sugerencia.detalle}</span>
        )}
      </span>
    </li>
  );
}
