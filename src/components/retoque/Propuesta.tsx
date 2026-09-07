import { Camera, Crop, Eye, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui';
import { BORDE_LABEL, superficiePerdida, type Corte, type Encuadre } from '@/lib/retoque';
import { cn } from '@/lib/utils';

/**
 * Lo que habría que hacerle a una foto, en dos listas y no en una.
 *
 * Es la decisión de diseño de esta pieza y no es cosmética: las dos listas
 * tienen destinatarios distintos y en un listado mezclado ninguno de los dos
 * puede usar la suya.
 *
 * - Lo de arriba se arregla tocando el archivo. Quien lo lee está sentado
 *   delante del panel y lo que necesita saber es si aplica el recorte o no —
 *   viéndolo antes, nunca a ciegas.
 * - Lo de abajo lo ejecuta una persona que tiene que coger el coche, quedar con
 *   el propietario y volver a la casa. Es una lista de recados, no un
 *   diagnóstico, y por eso no lleva ningún botón al lado: un botón ahí sería
 *   mentir.
 *
 * El reparto lo hace el servidor con `via`, nunca este fichero. Deducirlo del
 * texto significaría que un caso nuevo cae en el cubo equivocado sin dar error,
 * y el cubo equivocado es o prometer que un botón endereza una foto movida, o
 * mandar a alguien a cruzar la ciudad por un recorte.
 */

const VIA_TEXTO: Record<
  Encuadre['via'],
  { titulo: string; ayuda: string; icono: LucideIcon; tono: 'ok' | 'aviso' | 'neutro' }
> = {
  PROGRAMA: {
    titulo: 'Esto se arregla recortando',
    ayuda:
      'Sin volver a la casa: el código confirmó la franja que sobra. Aun así se mira antes de aplicarlo.',
    icono: Crop,
    tono: 'ok',
  },
  ASESOR: {
    titulo: 'Hay una propuesta de recorte, sin confirmar',
    ayuda:
      'El modelo lo propone pero el código no lo confirma. Míralo: si no mejora, se descarta y no pasa nada.',
    icono: Eye,
    tono: 'aviso',
  },
  REPETIR: {
    titulo: 'Esto pide volver a la casa',
    ayuda:
      'El archivo no tiene arreglo: no hay programa que devuelva lo que no se captó. Es una lista para llevarse.',
    icono: Camera,
    tono: 'aviso',
  },
  NADA: {
    titulo: 'No hay nada que hacerle',
    ayuda: 'Ni recorte que valga la pena ni motivo para repetirla.',
    icono: Wand2,
    tono: 'neutro',
  },
};

export function BloqueEncuadre({
  encuadre,
  /** El botón que abre la previsualización del recorte. Solo con `cortes`. */
  accion,
}: {
  encuadre: Encuadre;
  accion?: React.ReactNode;
}) {
  const texto = VIA_TEXTO[encuadre.via] ?? VIA_TEXTO.NADA;
  const Icono = texto.icono;

  /* Sin cortes y sin motivo no hay nada que decir, y un bloque vacío en la
     ficha de un inmueble es ruido que enseña a no leer los que sí traen algo. */
  if (encuadre.via === 'NADA' && !encuadre.motivo) return null;

  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3',
        texto.tono === 'ok' && 'border-emerald-200 bg-emerald-50/60',
        texto.tono === 'aviso' && 'border-amber-200 bg-amber-50/60',
        texto.tono === 'neutro' && 'border-border bg-secondary/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <Icono
            className={cn(
              'mt-0.5 size-4 shrink-0',
              texto.tono === 'ok' && 'text-emerald-700',
              texto.tono === 'aviso' && 'text-amber-700',
              texto.tono === 'neutro' && 'text-muted-foreground',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <h4
              className={cn(
                'text-sm font-medium',
                texto.tono === 'ok' && 'text-emerald-900',
                texto.tono === 'aviso' && 'text-amber-900',
              )}
            >
              {texto.titulo}
            </h4>
            <p
              className={cn(
                'text-xs',
                texto.tono === 'ok' && 'text-emerald-800',
                texto.tono === 'aviso' && 'text-amber-800',
                texto.tono === 'neutro' && 'text-muted-foreground',
              )}
            >
              {texto.ayuda}
            </p>
          </div>
        </div>
        {accion && <span className="shrink-0">{accion}</span>}
      </div>

      {/* Redactado por el servidor y en español: se pinta tal cual. */}
      {encuadre.motivo && <p className="text-sm">{encuadre.motivo}</p>}

      {encuadre.cortes.length > 0 && (
        <ul className="flex list-none flex-col gap-1.5 p-0">
          {encuadre.cortes.map((corte) => (
            <LineaCorte key={corte.borde} corte={corte} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Un corte, con los dos números que el servidor se molesta en separar.
 *
 * `porcion` es lo que estima el modelo y `medido` lo que mide el código de
 * franja plana en ese mismo borde. Enseñar los dos es lo que permite dudar: si
 * el modelo propone tirar el 30% y el código solo confirma un 4%, quien mira
 * tiene delante el motivo para no fiarse, en vez de una frase segura de sí
 * misma.
 */
function LineaCorte({ corte }: { corte: Corte }) {
  return (
    <li className="flex items-start gap-1.5 text-sm">
      <Crop className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="font-medium">
          Recortar el {Math.round(corte.porcion)}% de {BORDE_LABEL[corte.borde]}
        </span>{' '}
        <span className="align-middle">
          <Badge tone={corte.auto ? 'green' : 'neutral'}>
            {corte.auto ? 'medido' : 'sin confirmar'}
          </Badge>
        </span>
        <span className="block text-xs text-muted-foreground">
          {corte.que}
          {corte.auto
            ? ` · el código mide ${Math.round(corte.medido)}% de franja plana ahí`
            : ` · el código solo mide ${Math.round(corte.medido)}% de franja plana ahí, así que esto es opinión del modelo`}
        </span>
      </span>
    </li>
  );
}

/** El resumen de un corte para un sitio estrecho: «se tira el 28%». */
export function perdidaEnPalabras(cortes: Corte[]): string {
  const perdido = superficiePerdida(cortes);
  return `se tira el ${perdido}%`;
}
