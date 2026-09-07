import { useMemo, useState } from 'react';
import { ArrowDownUp, EyeOff, Sparkles, TriangleAlert } from 'lucide-react';

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
  /* Lo que el servidor NO volvió a cobrar en la última tanda. Se dice porque
     es la prueba de que no se pagó dos veces lo mismo. */
  const [ahorradas, setAhorradas] = useState<number | null>(null);

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

  /** Las que el modelo dice que ni siquiera son fotos del inmueble. */
  const noSonFotos = [...porImagen.values()].filter((a) => a.quality <= 10).length;

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
      const res = await imagenesIA.analizar(propertyId, { force: modo === 'todas' });
      setAhorradas(res.skipped);
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
  /* El tope del lote lo dice el servidor: es configurable, y copiarlo aquí
     haría que el botón prometiera más de lo que se manda en cuanto alguien lo
     baje para contener el gasto. */
  const lote = estado.data?.maxImages ?? 0;
  /* Lo que va a ir DE VERDAD en esta llamada: el servidor corta el lote en 20,
     así que prometer más sería mentir sobre lo que se paga y sobre lo que se
     va a ver al volver. */
  const pedidas = confirmando === 'todas' ? total : nuevas.length;
  const aAnalizar = Math.min(pedidas, lote);
  const quedan = pedidas - aAnalizar;

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
              ? `Analizar ${Math.min(nuevas.length, lote)} ${nuevas.length === 1 ? 'foto' : 'fotos'}`
              : `Volver a analizar · ${Math.min(total, lote)} ${total === 1 ? 'foto' : 'fotos'}`}
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
            {total > lote && ` Van de ${lote} en ${lote}, así que harán falta varias tandas.`}
          </p>
        )}

        {/* La prueba de que no se pagó dos veces lo mismo. Vale la pena decirlo
            justo después de gastar, que es cuando se piensa en el coste. */}
        {ahorradas !== null && ahorradas > 0 && (
          <Alert tone="ok">
            {ahorradas === 1
              ? 'Una foto ya estaba analizada con este prompt y no se volvió a cobrar.'
              : `${ahorradas} fotos ya estaban analizadas con este prompt y no se volvieron a cobrar.`}
          </Alert>
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

        {/* Una galería entera de logos no es un problema de foto: es un
            inmueble publicado sin fotos. Se cuenta arriba porque mirando
            tarjeta a tarjeta no se ve que sean TODAS. */}
        {noSonFotos > 0 && (
          <Alert tone="error">
            {noSonFotos === analizadas
              ? 'Ninguna de las fotos analizadas es una foto del inmueble: son el logo, capturas o documentos. Este inmueble está publicado sin fotos de verdad.'
              : `${noSonFotos} de las fotos analizadas no son fotos del inmueble: son el logo, capturas o documentos.`}
          </Alert>
        )}

        {album?.summary && <p className="text-sm">{album.summary}</p>}

        {/*
          Lo que falta no se ve mirando las fotos que hay, y es lo que más
          visitas cuesta: nadie compra sin ver la cocina y el baño.

          No es opinión del modelo: lo calcula el servidor restando las
          estancias que quedaron clasificadas, y teniendo en cuenta lo que ese
          inmueble puede tener —en un lote la cocina no falta, no existe—. Se
          dice porque cambia cuánto fiarse: el modelo llegó a decir que faltaba
          la cocina en álbumes donde acababa de clasificar una.
        */}
        {album && album.missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">
              Sin foto de <span className="text-xs">(lo cuenta el sistema, no la IA)</span>:
            </span>
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

        {/*
          Lo que esta pantalla NO puede prometer, dicho antes de los resultados.

          Medido sobre 62 imágenes reales: la detección de caras, placas y
          documentos acierta alrededor de la mitad de las veces, y dos pasadas
          idénticas del mismo prompt sobre las mismas fotos dieron cuatro
          hallazgos y cero. Con esos números, una tarjeta sin hallazgos no
          significa que la foto esté limpia. Si la pantalla dejara entender que
          sí, nadie volvería a mirar — y en este inventario hay caras de
          menores, un teléfono legible y matrículas, publicados hoy.
        */}
        {porImagen.size > 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Que una foto salga sin hallazgos quiere decir que la IA no encontró
            nada, no que no lo haya. Encuentra alrededor de la mitad de las caras,
            placas y documentos, y no siempre los mismos: sirve para levantar la
            mano, no para dar una galería por revisada. Lo que salga marcado, en
            cambio, míralo.
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
            {quedan > 0 && (
              <p className="text-muted-foreground">
                El servidor analiza {lote} por tanda, así que{' '}
                {quedan === 1 ? 'queda 1 foto' : `quedan ${quedan} fotos`} para la
                siguiente. Vuelve a pulsar cuando acabe ésta.
              </p>
            )}
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

/**
 * Escala de calidad, con los tramos que el prompt le pide al modelo.
 *
 * No son cortes redondos elegidos aquí: están escritos en
 * `defaults/analisis-imagenes.md` y el modelo puntúa contra ellos. Inventarse
 * otros en la pantalla hace que un 72 se lea «Buena» cuando lo que se le pidió
 * decir es «se ve bien, pero no llama a nadie».
 *
 * El tramo de abajo es el que más importa y por eso tiene nombre propio: 0-10
 * no es una foto fea, es que NO es una foto del inmueble —el logo de la
 * agencia, una captura, un documento—. Meterlo en el mismo cubo que «floja»
 * escondería el caso que más dinero vale: galerías enteras que son solo el
 * logo, en inmuebles que están publicados.
 */
function calidad(valor: number): {
  texto: string;
  tono: 'green' | 'amber' | 'red' | 'neutral';
  noEsFoto: boolean;
} {
  if (valor <= 10) return { texto: 'No es una foto', tono: 'red', noEsFoto: true };
  if (valor <= 35) return { texto: 'Inservible', tono: 'red', noEsFoto: false };
  if (valor <= 55) return { texto: 'Floja', tono: 'amber', noEsFoto: false };
  if (valor <= 75) return { texto: 'Aceptable', tono: 'neutral', noEsFoto: false };
  if (valor <= 90) return { texto: 'Buena', tono: 'green', noEsFoto: false };
  return { texto: 'Excepcional', tono: 'green', noEsFoto: false };
}

/** Lo que el modelo marcó como "esto no puede salir a una página pública". */
function privacidad(veredicto: AnalisisImagen): string[] {
  const p = veredicto.privacy;
  const dichos: string[] = [];
  if (p?.faces) dichos.push('caras reconocibles');
  if (p?.plates) dichos.push('placas de vehículo legibles');
  if (p?.documents) dichos.push('documentos con datos');
  if (p?.screens) dichos.push('pantallas con contenido legible');
  /* Llegó después: en los análisis viejos no viene, y ausente es «no». */
  if (p?.address) dichos.push('la dirección escrita en la fachada');
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
          {/* `usable` es del modelo y es más fiable que el número: se enseña
              aunque la nota no haya bajado del todo. */}
          {!veredicto.usable && !nota.noEsFoto && <Badge tone="red">No publicable</Badge>}
          {/* Ser buena foto y servir de portada son dos preguntas distintas:
              un baño impecable puntúa 90 de calidad y 5 de portada. */}
          {veredicto.coverScore >= 60 && (
            <Badge tone="green">Sirve de portada · {veredicto.coverScore}</Badge>
          )}
        </div>

        {/* Esto no es una foto fea: es que no hay inmueble en la imagen. Se
            dice con todas las letras porque la acción no es "repítela", es
            "esta galería no tiene fotos de verdad". */}
        {nota.noEsFoto && (
          <p className="text-xs font-medium text-red-700">
            No parece una foto del inmueble: puede ser el logo de la agencia, una
            captura o un documento.
          </p>
        )}

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
            {/* `issues` es texto libre escrito por el modelo, no un enum: no
                hay tipo que etiquetar ni por el que filtrar, y por eso la clave
                es la posición y no el contenido. */}
            {veredicto.issues.map((issue, i) => (
              <li
                key={i}
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
            /* "Sin hallazgos", no "sin problemas", y sin visto verde: lo
               segundo se lee como "revisado y correcto", que es justo lo que
               esto NO puede prometer. La advertencia entera está arriba, una
               sola vez, en la cabecera de la tarjeta. */
            <p className="text-xs text-muted-foreground">Sin hallazgos</p>
          )
        )}

        {/* Lo que hay que hacer, que es distinto de lo que está mal. */}
        {veredicto.fixes.length > 0 && (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {veredicto.fixes.map((fix, i) => (
              <li key={i} className="text-xs">
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
