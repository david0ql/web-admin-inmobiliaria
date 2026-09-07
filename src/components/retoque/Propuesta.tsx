import {
  Camera,
  Contrast,
  Crop,
  Eraser,
  Focus,
  Lightbulb,
  Maximize2,
  PanelTopDashed,
  Ruler,
  ScanLine,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui';
import { aspectoEnPalabras, type MetricasImagen, type Sugerencia } from '@/lib/retoque';
import { cn } from '@/lib/utils';

/**
 * Lo que habría que hacerle a una foto, en dos listas y no en una.
 *
 * Es la decisión de diseño de esta pieza y no es cosmética: las dos listas
 * tienen destinatarios distintos y en un listado mezclado ninguno de los dos
 * puede usar la suya.
 *
 * - Lo de arriba lo ejecuta un botón. Quien lo lee está sentado delante del
 *   panel y lo que necesita saber es si pulsa o no.
 * - Lo de abajo lo ejecuta una persona que tiene que coger el coche, quedar con
 *   el propietario y volver a la casa. Quien lo lee necesita llevárselo: es una
 *   lista de recados, no un diagnóstico. Por eso va junta, con el porqué
 *   escrito y sin ningún botón al lado — un botón ahí sería mentir.
 *
 * El reparto lo hace el servidor con `destino`, nunca este fichero. Deducirlo
 * del código aquí significaría que un código nuevo cae en el cubo equivocado
 * sin dar error, y el cubo equivocado es o prometer que un botón endereza una
 * foto movida, o mandar a alguien a cruzar la ciudad por un recorte.
 */

/** Solo para el icono. Un código que no esté aquí pinta el genérico y ya. */
const ICONOS: Record<string, LucideIcon> = {
  ASPECTO: Crop,
  RECORTE: Crop,
  ENDEREZAR: Ruler,
  EXPOSICION: Contrast,
  TECHO: PanelTopDashed,
  SUELO: ScanLine,
  PARED: Maximize2,
  RESOLUCION: Maximize2,
  BORROSA: Focus,
  MOVIDA: Focus,
  DESORDEN: Eraser,
  LUZ: Lightbulb,
  ENCUADRE: Camera,
};

const SEVERIDAD_TONO = {
  ALTA: 'red',
  MEDIA: 'amber',
  BAJA: 'neutral',
} as const;

const SEVERIDAD_TEXTO = {
  ALTA: 'Se nota',
  MEDIA: 'Mejorable',
  BAJA: 'Detalle',
} as const;

/** Parte las sugerencias por su destino, conservando el orden del servidor. */
export function partir(sugerencias: Sugerencia[]) {
  return {
    auto: sugerencias.filter((s) => s.destino === 'AUTO'),
    revisita: sugerencias.filter((s) => s.destino === 'REVISITA'),
  };
}

export function ListasPropuesta({
  sugerencias,
  metricas,
  /** El botón que ejecuta lo automático. Va SOLO en la lista de arriba. */
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

      {sugerencias.length === 0 && (
        /* «No propone nada», no «está perfecta»: lo segundo es un juicio que
           esta pantalla no puede firmar. */
        <p className="text-sm text-muted-foreground">
          No propone nada para esta foto.
        </p>
      )}

      {auto.length > 0 && (
        <Bloque
          titulo="Esto lo puede hacer el sistema"
          ayuda="Sin volver a la casa y sin cámara: son recortes, giros y luz sobre la foto que ya hay."
          icono={Wand2}
          tono="ok"
          accion={accionAuto}
        >
          {auto.map((s) => (
            <Linea key={s.id} sugerencia={s} />
          ))}
        </Bloque>
      )}

      {revisita.length > 0 && (
        <Bloque
          titulo="Esto pide volver a la casa"
          ayuda="No hay programa que lo arregle: falta luz, hay que mover cosas o hay que repetir la toma. Es una lista para llevarse."
          icono={Camera}
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
 * «Muy apaisada» no se puede discutir; «2,33:1» sí. Y cuando el asesor cree que
 * la propuesta se equivoca, el número es lo único que le deja comprobarlo sin
 * abrir la foto en otro programa.
 */
function Medidas({ metricas }: { metricas: MetricasImagen }) {
  return (
    <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        {metricas.anchura} × {metricas.altura} px
      </span>
      <span>Proporción {aspectoEnPalabras(metricas.aspecto)}</span>
      {metricas.nitidez !== null && <span>Nitidez {Math.round(metricas.nitidez)}</span>}
      {metricas.brillo !== null && <span>Luz {Math.round(metricas.brillo)}/255</span>}
    </p>
  );
}

function Bloque({
  titulo,
  ayuda,
  icono: Icono,
  tono,
  accion,
  children,
}: {
  titulo: string;
  ayuda: string;
  icono: LucideIcon;
  tono: 'ok' | 'aviso';
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3',
        tono === 'ok' ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <Icono
            className={cn(
              'mt-0.5 size-4 shrink-0',
              tono === 'ok' ? 'text-emerald-700' : 'text-amber-700',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <h4
              className={cn(
                'text-sm font-medium',
                tono === 'ok' ? 'text-emerald-900' : 'text-amber-900',
              )}
            >
              {titulo}
            </h4>
            <p
              className={cn(
                'text-xs',
                tono === 'ok' ? 'text-emerald-800' : 'text-amber-800',
              )}
            >
              {ayuda}
            </p>
          </div>
        </div>
        {accion && <span className="shrink-0">{accion}</span>}
      </div>

      <ul className="flex list-none flex-col gap-1.5 p-0">{children}</ul>
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
