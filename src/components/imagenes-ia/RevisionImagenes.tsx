import { useMemo, useState } from 'react';
import { ArrowDownUp, Check, Sparkles, TriangleAlert } from 'lucide-react';

import { Alert, Badge, Button, Card, Modal } from '@/components/ui';
import { ApiError, type PropertyImage } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import {
  imagenesIA,
  rolLabel,
  type AnalisisImagenes,
  type VeredictoImagen,
} from '@/lib/imagenes-ia';
import { cn } from '@/lib/utils';

/**
 * Lo que la IA opina de las fotos de un inmueble.
 *
 * Dos cosas que no son negociables y explican casi todo el diseño de esta
 * pantalla:
 *
 * 1. El análisis lo dispara el equipo, nunca el cliente. Por eso el botón vive
 *    dentro del panel y detrás de `can(...)`: quien manda una consignación
 *    desde la web pasa la puerta técnica —resolución, formato, peso— y ahí
 *    acaba su recorrido.
 * 2. Cada llamada se paga, y quien la dispara tiene que saber cuánto va a
 *    gastar ANTES de pulsar. De ahí que el botón diga el número de imágenes y
 *    que repetir un análisis pase por una confirmación con la fecha del
 *    anterior a la vista: repetir tiene que ser una decisión, no un clic
 *    distraído.
 *
 * Y la tercera, que es la que ordena la parte de abajo: la IA propone y la
 * persona decide. El orden sugerido no se aplica solo — se ve, se compara con
 * el que hay, y se acepta con un gesto o se ignora.
 */
export function RevisionImagenes({
  propertyId,
  images,
  onOrderApplied,
}: {
  propertyId: string;
  images: PropertyImage[];
  /** La galería de al lado tiene que repintarse cuando se aplica el orden. */
  onOrderApplied: () => void;
}) {
  const { can } = useAuth();
  const [confirmando, setConfirmando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [ignorado, setIgnorado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* La respuesta de un análisis recién lanzado pisa a la cargada: así el
     resultado aparece sin una segunda vuelta a la API. */
  const [reciente, setReciente] = useState<AnalisisImagenes | null>(null);

  const { data, error: cargaError, loading } = useFetch<AnalisisImagenes>(
    (signal) => imagenesIA.revision(propertyId, signal),
    [propertyId],
  );

  const analisis = reciente ?? data;

  /*
    Puede lanzar quien puede editar el inmueble. La barrera de verdad es la
    API; esto solo evita enseñar un botón que va a devolver 403.
  */
  const puedeLanzar = can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER', 'AGENT');

  /** Las fotos en el orden que propone la IA, y si ese orden cambia algo. */
  const propuesta = useMemo(() => {
    const items = [...(analisis?.items ?? [])].sort(
      (a, b) => a.suggestedPosition - b.suggestedPosition,
    );
    const actual = [...images].sort((a, b) => a.position - b.position).map((i) => i.id);
    const sugerido = items.map((i) => i.imageId);
    // Solo tiene sentido ofrecer el cambio si la propuesta cubre las mismas
    // fotos que hay: con fotos nuevas sin analizar, aplicar dejaría fuera unas
    // cuantas sin que nadie lo hubiera pedido.
    const completa =
      sugerido.length === actual.length && sugerido.every((id) => actual.includes(id));
    const distinto = completa && sugerido.some((id, i) => id !== actual[i]);
    return { items, sugerido, distinto };
  }, [analisis, images]);

  /* Solo tiene sentido hablar de "fotos que no entran en el análisis" cuando
     hay un análisis: sin él, las que faltan son todas y eso ya lo dice el
     texto de arriba. */
  const sinAnalizar = analisis?.lastRun
    ? analisis.imageCount - analisis.analyzedCount
    : 0;

  async function lanzar() {
    setConfirmando(false);
    setAnalizando(true);
    setError(null);
    try {
      setReciente(await imagenesIA.analizar(propertyId));
      setIgnorado(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo analizar. Inténtalo de nuevo.',
      );
    } finally {
      setAnalizando(false);
    }
  }

  async function aplicarOrden() {
    setAplicando(true);
    setError(null);
    try {
      setReciente(await imagenesIA.aplicarOrden(propertyId, propuesta.sugerido));
      onOrderApplied();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar el orden de las fotos.',
      );
    } finally {
      setAplicando(false);
    }
  }

  /*
    Que la revisión no esté disponible no puede tumbar la ficha del inmueble:
    es una ayuda, no el inventario. Se calla y ya.
  */
  if (loading || (cargaError && !analisis)) return null;

  const total = images.length;

  return (
    <Card
      title={
        <h3 className="micro-label flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden /> Revisión con IA
        </h3>
      }
      action={
        puedeLanzar &&
        total > 0 && (
          <Button
            variant={analisis?.lastRun ? 'outline' : 'default'}
            size="sm"
            loading={analizando}
            onClick={() => setConfirmando(true)}
          >
            {analisis?.lastRun
              ? `Volver a analizar · ${total} ${total === 1 ? 'foto' : 'fotos'}`
              : `Analizar ${total} ${total === 1 ? 'foto' : 'fotos'}`}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}

        {total === 0 && (
          <p className="text-sm text-muted-foreground">
            Sube fotos y la IA podrá decir para qué sirve cada una, qué calidad tiene y en
            qué orden se ven mejor.
          </p>
        )}

        {total > 0 && !analisis?.lastRun && (
          <p className="text-sm text-muted-foreground">
            Todavía no se ha analizado. El análisis dice para qué sirve cada foto, qué
            calidad tiene, qué problemas se ven y en qué orden conviene enseñarlas.{' '}
            <strong className="font-medium text-foreground">
              Son {total} {total === 1 ? 'imagen' : 'imágenes'} y cada una se cobra.
            </strong>
          </p>
        )}

        {analisis?.lastRun && (
          <p className="note">
            Analizado el {dateTime(analisis.lastRun.createdAt)} con el prompt v
            {analisis.lastRun.promptVersion}
            {analisis.lastRun.promptLabel ? ` (${analisis.lastRun.promptLabel})` : ''}
            {analisis.lastRun.actorName ? ` · lo lanzó ${analisis.lastRun.actorName}` : ''}
          </p>
        )}

        {/* Fotos subidas después del análisis: la propuesta de orden ya no
            habla de la galería que se está viendo, y hay que decirlo. */}
        {sinAnalizar > 0 && (
          <Alert tone="warn">
            {sinAnalizar === 1
              ? 'Hay una foto subida después del análisis, así que no entra en lo que ves aquí.'
              : `Hay ${sinAnalizar} fotos subidas después del análisis, así que no entran en lo que ves aquí.`}
          </Alert>
        )}

        {/* El gesto. Se ofrece solo cuando cambia algo de verdad, y se puede
            descartar: la IA sugiere, aquí manda quien mira. */}
        {propuesta.distinto && !ignorado && (
          <Alert
            tone="ok"
            action={
              <span className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIgnorado(true)}>
                  Dejarlo como está
                </Button>
                <Button size="sm" loading={aplicando} onClick={() => void aplicarOrden()}>
                  <ArrowDownUp /> Aplicar este orden
                </Button>
              </span>
            }
          >
            La IA propone otro orden para la galería. Es una sugerencia: decides tú.
          </Alert>
        )}

        {propuesta.distinto && ignorado && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Propuesta de orden descartada.
            <button
              type="button"
              onClick={() => setIgnorado(false)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Volver a verla
            </button>
          </p>
        )}

        {propuesta.items.length > 0 && (
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {propuesta.items.map((item, indice) => (
              <FichaVeredicto key={item.imageId} item={item} propuesto={indice + 1} />
            ))}
          </ul>
        )}
      </div>

      {/* Lo que cuesta, a la vista, justo antes de gastarlo. */}
      {confirmando && (
        <Modal
          title={analisis?.lastRun ? 'Volver a analizar las fotos' : 'Analizar las fotos'}
          onClose={() => setConfirmando(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void lanzar()}>
                Analizar {total} {total === 1 ? 'imagen' : 'imágenes'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Se van a mandar al modelo{' '}
              <strong>
                {total} {total === 1 ? 'imagen' : 'imágenes'}
              </strong>
              . Cada imagen es una llamada que la agencia paga.
            </p>
            {analisis?.lastRun && (
              <p className="text-muted-foreground">
                Ya hay un análisis del {dateTime(analisis.lastRun.createdAt)} hecho con el
                prompt v{analisis.lastRun.promptVersion}. Repetirlo tiene sentido si has
                cambiado las fotos o el prompt; si no, lo que ya está sigue valiendo.
              </p>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}

/** Escala de calidad: la nota cruda no dice nada sin una palabra al lado. */
function calidad(valor: number): { texto: string; tono: 'green' | 'amber' | 'red' } {
  if (valor >= 70) return { texto: 'Buena', tono: 'green' };
  if (valor >= 40) return { texto: 'Justa', tono: 'amber' };
  return { texto: 'Floja', tono: 'red' };
}

/** Una foto con lo que la IA dijo de ella. La reutiliza la prueba del prompt. */
export function FichaVeredicto({ item, propuesto }: { item: VeredictoImagen; propuesto: number }) {
  const nota = calidad(item.quality);
  const bloqueante = item.issues.some((i) => i.severity === 'BLOCK');

  return (
    <li className={cn('overflow-hidden rounded-md border', bloqueante && 'border-red-300')}>
      <div className="relative aspect-[4/3] bg-secondary">
        <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
        {/* El número es la posición que propone la IA, no la que tiene hoy: por
            eso lleva almohadilla y no la palabra "portada" salvo si lo es. */}
        <span className="absolute top-1.5 left-1.5">
          <Badge tone={item.isSuggestedCover ? 'ink' : 'neutral'}>
            {item.isSuggestedCover ? 'Portada propuesta' : `#${propuesto}`}
          </Badge>
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="blue">{rolLabel(item.role, item.roleLabel)}</Badge>
          <Badge tone={nota.tono}>
            {nota.texto} · {Math.round(item.quality)}
          </Badge>
        </div>

        {item.issues.length > 0 ? (
          <ul className="flex list-none flex-col gap-1 p-0">
            {item.issues.map((issue) => (
              <li
                key={issue.code}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <TriangleAlert
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0',
                    issue.severity === 'BLOCK' && 'text-red-600',
                    issue.severity === 'WARN' && 'text-amber-600',
                  )}
                  aria-hidden
                />
                {/* El texto viene redactado del servidor: se pinta tal cual. */}
                <span>{issue.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden /> Sin
            problemas
          </p>
        )}

        {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
      </div>
    </li>
  );
}
