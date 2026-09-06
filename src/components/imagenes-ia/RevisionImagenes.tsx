import { useMemo, useState } from 'react';
import { ArrowDownUp, Check, EyeOff, Sparkles, TriangleAlert } from 'lucide-react';

import { Alert, Badge, Button, Card, Modal } from '@/components/ui';
import { ApiError, type PropertyImage } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import {
  imagenesIA,
  type AnalisisImagen,
  type EstadoImagenesIA,
  type RevisionInmueble,
} from '@/lib/imagenes-ia';
import { cn } from '@/lib/utils';

/**
 * Lo que la IA opina de las fotos de un inmueble.
 *
 * Tres cosas que no son negociables y explican casi todo el diseño:
 *
 * 1. El análisis lo dispara el equipo, nunca el cliente. Por eso el botón vive
 *    dentro del panel y detrás de `can(...)`: quien manda una consignación
 *    desde la web pasa la puerta de código —resolución, proporción, nitidez— y
 *    ahí acaba su recorrido.
 * 2. Cada imagen es una llamada que se paga, así que el botón dice cuántas van
 *    a ir ANTES de pulsarlo, no se repite lo ya analizado con el mismo prompt,
 *    y rehacerlo pasa por una confirmación que enseña con qué versión se hizo
 *    lo anterior.
 * 3. La IA propone y la persona decide. El orden sugerido no se aplica solo: se
 *    compara con el que hay y se acepta con un gesto, o se ignora.
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
  const [confirmando, setConfirmando] = useState<'nuevas' | 'todas' | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [ignorado, setIgnorado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estado = useFetch<EstadoImagenesIA>((signal) => imagenesIA.estado(signal), []);
  const revision = useFetch<RevisionInmueble>(
    (signal) => imagenesIA.revision(propertyId, signal),
    [propertyId],
  );

  /** Cómo se llama cada estancia. Lo manda el servidor, no un diccionario de aquí. */
  const rooms = useMemo(
    () => new Map((estado.data?.rooms ?? []).map((r) => [r.value, r.label])),
    [estado.data],
  );

  /**
   * Un veredicto por foto: el más reciente.
   *
   * La API devuelve una fila por (foto, versión de prompt, modelo) —analizar la
   * misma foto con el v3 y con el v4 deja dos— y las trae de la más nueva a la
   * más vieja. Quedarse con la primera de cada foto es quedarse con la vigente.
   */
  const porImagen = useMemo(() => {
    const mapa = new Map<string, AnalisisImagen>();
    for (const a of revision.data?.images ?? []) {
      if (!mapa.has(a.propertyImageId)) mapa.set(a.propertyImageId, a);
    }
    return mapa;
  }, [revision.data]);

  const album = revision.data?.album ?? null;

  /** Las fotos en el orden que propone la IA, y si ese orden cambia algo. */
  const propuesta = useMemo(() => {
    const actual = [...images].sort((a, b) => a.position - b.position).map((i) => i.id);
    const sugerido = album?.suggestedOrder ?? [];
    // Solo se ofrece el cambio si la propuesta cubre exactamente las fotos que
    // hay: con fotos subidas después, aplicarla dejaría a unas cuantas fuera
    // sin que nadie lo hubiera pedido.
    const completa =
      sugerido.length === actual.length && sugerido.every((id) => actual.includes(id));
    return {
      sugerido,
      distinto: completa && sugerido.some((id, i) => id !== actual[i]),
    };
  }, [album, images]);

  /** Las que no tienen veredicto: lo que costaría un análisis normal. */
  const nuevas = images.filter((img) => !porImagen.has(img.id));
  const analizadas = images.length - nuevas.length;

  /* La barrera de verdad es la API; esto solo evita ofrecer un botón que va a
     devolver 403. Y sin clave del proveedor no se ofrece nada: pulsar para
     recibir un 503 no es una opción, es una trampa. */
  const puedeLanzar =
    can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER', 'AGENT') &&
    estado.data?.enabled === true;

  async function lanzar(modo: 'nuevas' | 'todas') {
    setConfirmando(null);
    setAnalizando(true);
    setError(null);
    try {
      await imagenesIA.analizar(propertyId, { force: modo === 'todas' });
      setIgnorado(false);
      revision.reload();
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
      await imagenesIA.aplicarOrden(propertyId, propuesta.sugerido);
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
  if (estado.loading || revision.loading) return null;
  if (estado.error || revision.error || !revision.data) return null;

  const total = images.length;
  const aAnalizar = confirmando === 'todas' ? total : nuevas.length;

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
            variant={analizadas > 0 ? 'outline' : 'default'}
            size="sm"
            loading={analizando}
            onClick={() => setConfirmando(nuevas.length > 0 ? 'nuevas' : 'todas')}
          >
            {nuevas.length > 0
              ? `Analizar ${nuevas.length} ${nuevas.length === 1 ? 'foto' : 'fotos'}`
              : `Volver a analizar · ${total} ${total === 1 ? 'foto' : 'fotos'}`}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}

        {estado.data?.enabled === false && (
          <p className="text-sm text-muted-foreground">
            El análisis con IA está apagado en este servidor.
          </p>
        )}

        {total === 0 && (
          <p className="text-sm text-muted-foreground">
            Sube fotos y la IA podrá decir qué estancia es cada una, si están
            presentables, en qué orden van y si hay algo que no debería salir a una
            página pública.
          </p>
        )}

        {total > 0 && analizadas === 0 && estado.data?.enabled && (
          <p className="text-sm text-muted-foreground">
            Todavía no se ha analizado.{' '}
            <strong className="font-medium text-foreground">
              Son {total} {total === 1 ? 'imagen' : 'imágenes'} y cada una se cobra.
            </strong>
          </p>
        )}

        {analizadas > 0 && (
          <p className="note">
            {analizadas} de {total} {total === 1 ? 'foto analizada' : 'fotos analizadas'}
            {album ? ` · prompt v${album.promptVersion} · ${album.model}` : ''}
            {album ? ` · ${dateTime(album.createdAt)}` : ''}
          </p>
        )}

        {/* "Caducado" no es que esté mal: es que se hizo con otro prompt u otro
            modelo, y repetirlo daría otra cosa. Quien decide si compensa
            pagarlo es quien lo lee. */}
        {revision.data.stale && (
          <Alert tone="warn">
            Parte de esto se analizó con otra versión del prompt o con otro modelo. Ahora
            se usaría el prompt v{revision.data.promptVersion} con {revision.data.model}.
          </Alert>
        )}

        {nuevas.length > 0 && analizadas > 0 && (
          <Alert tone="warn">
            {nuevas.length === 1
              ? 'Hay una foto sin analizar, así que no entra en lo que ves aquí.'
              : `Hay ${nuevas.length} fotos sin analizar, así que no entran en lo que ves aquí.`}
          </Alert>
        )}

        {album?.summary && <p className="text-sm">{album.summary}</p>}

        {/* Lo que falta no se ve mirando las fotos que hay, y es lo que más
            visitas cuesta: nadie compra sin ver la cocina y el baño. */}
        {album && album.missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">No hay foto de:</span>
            {album.missing.map((m) => (
              <Badge key={m} tone="amber">
                {rooms.get(m) ?? m}
              </Badge>
            ))}
          </div>
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

        {porImagen.size > 0 && (
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {ordenar(images, propuesta.sugerido).map((img, indice) => {
              const veredicto = porImagen.get(img.id);
              if (!veredicto) return null;
              return (
                <FichaVeredicto
                  key={img.id}
                  url={img.url}
                  veredicto={veredicto}
                  propuesto={propuesta.sugerido.length ? indice + 1 : null}
                  esPortada={album?.coverImageId === img.id}
                  room={rooms.get(veredicto.room) ?? veredicto.room}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Lo que cuesta, a la vista, justo antes de gastarlo. */}
      {confirmando && (
        <Modal
          title={
            confirmando === 'todas' ? 'Volver a analizarlo todo' : 'Analizar las fotos'
          }
          onClose={() => setConfirmando(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmando(null)}>
                Cancelar
              </Button>
              {confirmando === 'nuevas' && analizadas > 0 && (
                <Button variant="outline" onClick={() => void lanzar('todas')}>
                  Rehacerlo todo ({total})
                </Button>
              )}
              <Button onClick={() => void lanzar(confirmando)}>
                Analizar {aAnalizar} {aAnalizar === 1 ? 'imagen' : 'imágenes'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Se van a mandar al modelo{' '}
              <strong>
                {aAnalizar} {aAnalizar === 1 ? 'imagen' : 'imágenes'}
              </strong>
              . Cada imagen es una llamada que la agencia paga.
            </p>
            {confirmando === 'nuevas' && analizadas > 0 && (
              <p className="text-muted-foreground">
                Las {analizadas} ya analizadas no se vuelven a pagar: la pregunta es la
                misma mientras no cambie el prompt.
              </p>
            )}
            {confirmando === 'todas' && album && (
              <p className="text-muted-foreground">
                Lo que hay se hizo el {dateTime(album.createdAt)} con el prompt v
                {album.promptVersion}. Rehacerlo tiene sentido si has cambiado el prompt;
                si no, lo que ya está sigue valiendo.
              </p>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}

/** Las fotos en el orden propuesto; las que no estén en la propuesta, al final. */
function ordenar(images: PropertyImage[], sugerido: string[]): PropertyImage[] {
  if (!sugerido.length) return [...images].sort((a, b) => a.position - b.position);
  const puesto = new Map(sugerido.map((id, i) => [id, i]));
  return [...images].sort((a, b) => (puesto.get(a.id) ?? 999) - (puesto.get(b.id) ?? 999));
}

/** Escala de calidad: la nota cruda no dice nada sin una palabra al lado. */
function calidad(valor: number): { texto: string; tono: 'green' | 'amber' | 'red' } {
  if (valor >= 70) return { texto: 'Buena', tono: 'green' };
  if (valor >= 40) return { texto: 'Justa', tono: 'amber' };
  return { texto: 'Floja', tono: 'red' };
}

/** Lo que el modelo marcó como "esto no puede salir a una página pública". */
function privacidad(veredicto: AnalisisImagen): string[] {
  const p = veredicto.privacy;
  const dichos: string[] = [];
  if (p?.faces) dichos.push('caras reconocibles');
  if (p?.plates) dichos.push('placas de vehículo legibles');
  if (p?.documents) dichos.push('documentos con datos');
  if (p?.screens) dichos.push('pantallas con contenido legible');
  return dichos;
}

/** Una foto con lo que la IA dijo de ella. La reutiliza la pantalla del prompt. */
export function FichaVeredicto({
  url,
  veredicto,
  propuesto,
  esPortada,
  room,
}: {
  url: string;
  veredicto: AnalisisImagen;
  /** Puesto en el orden propuesto, o `null` si no hay propuesta. */
  propuesto: number | null;
  esPortada: boolean;
  room: string;
}) {
  const nota = calidad(veredicto.quality);
  const privado = privacidad(veredicto);

  return (
    <li
      className={cn(
        'overflow-hidden rounded-md border',
        (privado.length > 0 || !veredicto.usable) && 'border-red-300',
      )}
    >
      <div className="relative aspect-[4/3] bg-secondary">
        <img
          src={url}
          alt={veredicto.caption ?? ''}
          loading="lazy"
          className="size-full object-cover"
        />
        {(esPortada || propuesto !== null) && (
          <span className="absolute top-1.5 left-1.5">
            <Badge tone={esPortada ? 'ink' : 'neutral'}>
              {esPortada ? 'Portada propuesta' : `#${propuesto}`}
            </Badge>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="blue">{room}</Badge>
          <Badge tone={nota.tono}>
            {nota.texto} · {veredicto.quality}
          </Badge>
          {/* Ser buena foto y servir de portada son dos preguntas distintas:
              un baño impecable puntúa 90 de calidad y 5 de portada. */}
          {veredicto.coverScore >= 60 && (
            <Badge tone="green">Sirve de portada · {veredicto.coverScore}</Badge>
          )}
        </div>

        {/* Lo más serio de la pantalla: la ficha es una página que Google
            indexa. Va primero y en rojo. */}
        {privado.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs font-medium text-red-700">
            <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              No debería publicarse así: se ven {privado.join(', ')}.
              {veredicto.privacy?.notes ? ` ${veredicto.privacy.notes}` : ''}
            </span>
          </p>
        )}

        {veredicto.issues.length > 0 ? (
          <ul className="flex list-none flex-col gap-1 p-0">
            {veredicto.issues.map((issue) => (
              <li
                key={issue}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                  aria-hidden
                />
                {/* Redactado por el modelo en español: se pinta tal cual. */}
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        ) : (
          privado.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden /> Sin
              problemas
            </p>
          )
        )}

        {/* Lo que hay que hacer, que es distinto de lo que está mal. */}
        {veredicto.fixes.length > 0 && (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {veredicto.fixes.map((fix) => (
              <li key={fix} className="text-xs">
                → {fix}
              </li>
            ))}
          </ul>
        )}

        {veredicto.caption && (
          <p className="text-xs text-muted-foreground italic">«{veredicto.caption}»</p>
        )}
      </div>
    </li>
  );
}
