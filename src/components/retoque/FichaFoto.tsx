import { useEffect, useRef, useState } from 'react';
import { Check, Undo2, Wand2, X } from 'lucide-react';

import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui';
import { ApiError, type MediaImage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import {
  costeEnPalabras,
  importe,
  retoque as apiRetoque,
  type EstadoModuloRetoque,
  type PropuestaImagen,
  type Retoque,
  type ReveladoImagen,
} from '@/lib/retoque';
import { Comparador } from './Comparador';
import { ListasPropuesta, partir } from './Propuesta';

/**
 * Una foto, con todo lo que se puede hacer con ella.
 *
 * Se abre desde la rejilla y no es una pantalla aparte a propósito: el asesor
 * ya está mirando las fotos del inmueble cuando decide que una no le gusta, y
 * mandarlo a otra ruta le haría perder el sitio.
 *
 * Lo que ordena el contenido, de arriba abajo, es cuánto compromete cada cosa:
 * primero lo que ya pasó y no costó nada (el revelado, comparable y
 * reversible), después lo que habría que hacer (la propuesta, que solo son
 * palabras) y al final lo único que gasta dinero y cambia lo que ve un
 * comprador (el retoque con IA). Puesto al revés, el botón caro sería lo
 * primero que se ve.
 */
export function FichaFoto({
  propertyId,
  image,
  posicion,
  total,
  revelado,
  propuesta,
  estadoRetoque,
  editable,
  onClose,
  onCambio,
}: {
  propertyId: string;
  image: MediaImage;
  posicion: number;
  total: number;
  revelado: ReveladoImagen | null;
  propuesta: PropuestaImagen | null;
  /** `null` si este servidor no tiene el módulo de retoque, o está apagado. */
  estadoRetoque: EstadoModuloRetoque | null;
  editable: boolean;
  onClose: () => void;
  /** La rejilla y la galería de arriba tienen que repintarse. */
  onCambio: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [trabajo, setTrabajo] = useState<Retoque | null>(null);
  const [cargandoTrabajo, setCargandoTrabajo] = useState(estadoRetoque !== null);

  /* Lo que hubiera de antes: un retoque a medias o uno ya aceptado. Si el
     módulo no está, no se pregunta. */
  useEffect(() => {
    if (!estadoRetoque) return;
    let vivo = true;
    apiRetoque
      .retoqueDe(image.id)
      .then((r) => {
        if (vivo) setTrabajo(r);
      })
      .catch(() => {
        /* Que no se sepa si hay un retoque previo no puede tumbar el diálogo:
           lo demás —el revelado y la propuesta— sigue siendo útil. */
      })
      .finally(() => {
        if (vivo) setCargandoTrabajo(false);
      });
    return () => {
      vivo = false;
    };
  }, [image.id, estadoRetoque]);

  /*
    Mientras el modelo genera, se vuelve a preguntar cada tres segundos.

    Sin esto el asesor se queda mirando un «procesando» que no cambia nunca y
    acaba pulsando otra vez — y la segunda pulsación se paga igual que la
    primera.
  */
  useEffect(() => {
    if (trabajo?.estado !== 'PROCESANDO') return;
    const id = setInterval(() => {
      void apiRetoque
        .retoqueDe(image.id)
        .then((r) => {
          if (r) setTrabajo(r);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [trabajo?.estado, image.id]);

  function fallo(err: unknown, porDefecto: string) {
    /* El 404 se dice aparte: no es que quien pulsa haya roto nada, es que el
       panel va por delante del servidor. Mismo criterio que en la revisión de
       privacidad. */
    if (err instanceof ApiError && err.status === 404) {
      setError('Este servidor todavía no sabe hacer eso. Nada ha cambiado.');
      return;
    }
    setError(err instanceof ApiError ? err.message : porDefecto);
  }

  /** Rehacer el revelado con lo que propone la lista automática. */
  async function aplicarAutomaticas() {
    setOcupado(true);
    setError(null);
    try {
      await apiRetoque.revelar(propertyId, {
        imageIds: [image.id],
        force: true,
      });
      onCambio();
    } catch (err) {
      fallo(err, 'No se pudo aplicar el revelado.');
    } finally {
      setOcupado(false);
    }
  }

  async function volverAlOriginalRevelado() {
    setOcupado(true);
    setError(null);
    try {
      await apiRetoque.descartarRevelado(image.id);
      onCambio();
    } catch (err) {
      fallo(err, 'No se pudo volver al original.');
    } finally {
      setOcupado(false);
    }
  }

  async function lanzarRetoque() {
    setConfirmando(false);
    setOcupado(true);
    setError(null);
    try {
      /* Solo se le mandan las sugerencias que el diagnóstico marcó como
         automáticas: pedirle al modelo que arregle «falta luz» es pedirle que
         se invente una lámpara. */
      const ids = propuesta
        ? partir(propuesta.sugerencias).auto.map((s) => s.id)
        : undefined;
      setTrabajo(await apiRetoque.retocar(image.id, ids));
    } catch (err) {
      fallo(err, 'No se pudo lanzar el retoque.');
    } finally {
      setOcupado(false);
    }
  }

  async function decidir(acepta: boolean) {
    if (!trabajo) return;
    setOcupado(true);
    setError(null);
    try {
      const res = acepta
        ? await apiRetoque.aceptar(trabajo.id)
        : await apiRetoque.descartar(trabajo.id);
      setTrabajo(res);
      onCambio();
    } catch (err) {
      fallo(err, 'No se pudo guardar la decisión.');
    } finally {
      setOcupado(false);
    }
  }

  async function deshacerRetoque() {
    setOcupado(true);
    setError(null);
    try {
      await apiRetoque.volverAlOriginal(image.id);
      setTrabajo(null);
      onCambio();
    } catch (err) {
      fallo(err, 'No se pudo volver al original.');
    } finally {
      setOcupado(false);
    }
  }

  /*
    Cuando el resultado llega, se lleva a la vista.

    El retoque tarda entre segundos y minutos y el bloque vive al final de un
    diálogo que en el móvil hay que bajar entero: sin esto, la foto por la que
    se acaba de pagar aparece fuera de pantalla y quien esperaba mirando arriba
    no ve que ya está.
  */
  const bloqueRetoque = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trabajo?.estado === 'LISTO') {
      bloqueRetoque.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [trabajo?.estado]);

  const revelada = revelado?.estado === 'HECHO';
  const retocada = trabajo?.estado === 'ACEPTADO' || image.aiEdited === true;
  const autoPendientes = propuesta ? partir(propuesta.sugerencias).auto.length : 0;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-w-3xl gap-3 p-4">
        <DialogTitle className="flex flex-wrap items-center gap-2 pr-10 text-sm font-medium">
          Foto {posicion} de {total}
          {image.width && image.height ? (
            <span className="tabular font-normal text-muted-foreground">
              {image.width} × {image.height} px
            </span>
          ) : null}
          {retocada && <Badge tone="amber">Retocada con IA</Badge>}
        </DialogTitle>

        <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto">
          {error && <Alert tone="error">{error}</Alert>}

          {/* --- 1. el revelado: lo que ya se hizo, y si mejoró ------------ */}
          {revelada && revelado ? (
            <section className="flex flex-col gap-2">
              <Comparador
                antes={revelado.urlAntes}
                despues={revelado.urlDespues}
                alt={image.description ?? `Foto ${posicion} revelada`}
              />
              {revelado.ajustes.length > 0 && (
                <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {revelado.ajustes.map((a) => (
                    <span key={a.clave}>
                      {a.etiqueta} {a.valor}
                    </span>
                  ))}
                </p>
              )}
              {editable && (
                /* La marcha atrás, a la vista y no escondida en un menú: lo que
                   hace aceptable que el revelado se aplique solo es que
                   deshacerlo sea trivial. */
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  disabled={ocupado}
                  onClick={() => void volverAlOriginalRevelado()}
                >
                  <Undo2 /> Publicar el original, sin revelar
                </Button>
              )}
            </section>
          ) : (
            <img
              src={image.urlLarge ?? image.url}
              alt={image.description ?? `Foto ${posicion}`}
              className="max-h-[52dvh] w-full rounded-md object-contain sm:max-h-[60dvh]"
            />
          )}

          {revelado && revelado.estado !== 'HECHO' && revelado.motivo && (
            <p className="text-xs text-muted-foreground">
              {revelado.estado === 'OMITIDO'
                ? `No se reveló: ${revelado.motivo}`
                : `El revelado falló: ${revelado.motivo}`}
            </p>
          )}

          {/* --- 2. la propuesta: dos listas, dos destinatarios ------------ */}
          {propuesta && (
            <ListasPropuesta
              sugerencias={propuesta.sugerencias}
              metricas={propuesta.metricas}
              accionAuto={
                editable &&
                autoPendientes > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={ocupado}
                    onClick={() => void aplicarAutomaticas()}
                  >
                    Aplicarlo ahora
                  </Button>
                )
              }
            />
          )}

          {/* --- 3. el retoque con IA: lo único que cuesta dinero ---------- */}
          {estadoRetoque?.enabled && editable && !cargandoTrabajo && (
            <div ref={bloqueRetoque}>
              <BloqueRetoque
                estado={estadoRetoque}
                trabajo={trabajo}
                ocupado={ocupado}
                baseComparacion={
                  revelada && revelado
                    ? revelado.urlDespues
                    : (image.urlLarge ?? image.url)
                }
                onPedir={() => setConfirmando(true)}
                onDecidir={(acepta) => void decidir(acepta)}
                onDeshacer={() => void deshacerRetoque()}
              />
            </div>
          )}
        </div>

        {/* Lo que cuesta, delante del botón que lo gasta. */}
        {confirmando && estadoRetoque && (
          <Dialog open onOpenChange={(abierto) => !abierto && setConfirmando(false)}>
            <DialogContent className="max-w-md gap-3 p-5">
              <DialogTitle className="text-sm font-medium">
                Retocar esta foto con IA
              </DialogTitle>
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Esta llamada cuesta{' '}
                  <strong className="whitespace-nowrap">
                    {costeEnPalabras(estadoRetoque)}
                  </strong>
                  , y se paga aunque el resultado no te guste.
                </p>
                <p className="text-muted-foreground">
                  La IA no corrige la foto: genera una nueva a partir de ella. Puede
                  añadir cosas que en la casa no están. Lo que salga no se publica hasta
                  que lo aceptes, y el original se guarda.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
                <Button loading={ocupado} onClick={() => void lanzarRetoque()}>
                  <Wand2 /> Retocar por {importe(estadoRetoque)}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * El botón caro y lo que pasa después.
 *
 * Tres estados y cada uno tiene una única acción evidente: pedirlo, decidirlo,
 * deshacerlo. Lo que no existe es un camino en el que el resultado se publique
 * sin que nadie lo haya mirado.
 */
function BloqueRetoque({
  estado,
  trabajo,
  ocupado,
  baseComparacion,
  onPedir,
  onDecidir,
  onDeshacer,
}: {
  estado: EstadoModuloRetoque;
  trabajo: Retoque | null;
  ocupado: boolean;
  /** Con qué se compara el resultado: lo que se publica ahora mismo. */
  baseComparacion: string;
  onPedir: () => void;
  onDecidir: (acepta: boolean) => void;
  onDeshacer: () => void;
}) {
  if (trabajo?.estado === 'PROCESANDO') {
    return (
      <Alert tone="warn">
        La IA está generando la foto. Ya está pagada: no hace falta volver a pulsar. Esto
        tarda entre unos segundos y un par de minutos.
      </Alert>
    );
  }

  if (trabajo?.estado === 'FALLIDO') {
    return (
      <Alert
        tone="error"
        action={
          <Button size="sm" variant="outline" onClick={onPedir}>
            Volver a intentarlo
          </Button>
        }
      >
        El retoque falló{trabajo.motivo ? `: ${trabajo.motivo}` : '.'}
      </Alert>
    );
  }

  if (trabajo?.estado === 'ACEPTADO') {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-sm text-amber-900">
          {/* Que esté marcada no es un detalle de la ficha: es lo que separa un
              catálogo honesto de uno que enseña casas que no existen. */}
          Lo que se publica de esta foto es un retoque generado por IA
          {trabajo.createdAt ? ` el ${dateTime(trabajo.createdAt)}` : ''}. Sale marcada en
          la galería para que se sepa.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={ocupado}
          onClick={onDeshacer}
        >
          <Undo2 /> Volver a la foto original
        </Button>
      </section>
    );
  }

  if (trabajo?.estado === 'LISTO' && trabajo.urlResultado) {
    return (
      <section className="flex flex-col gap-2 rounded-md border p-3">
        <p className="text-sm font-medium">
          Esto es lo que ha salido. Todavía no se publica.
        </p>
        <Comparador
          antes={baseComparacion}
          despues={trabajo.urlResultado}
          alt="Resultado del retoque con IA"
          etiquetaAntes="Lo que hay"
          etiquetaDespues="Retoque IA"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={ocupado} onClick={() => onDecidir(true)}>
            <Check /> Publicar el retoque
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado}
            onClick={() => onDecidir(false)}
          >
            <X /> Descartarlo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Descartarlo no devuelve lo que costó: lo que se paga es generarlo. Publicarlo
          deja la foto marcada como retocada con IA, y se puede deshacer después.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium">Retocar con IA</h4>
          {/* El coste va aquí, en el mismo bloque que el botón y antes de él.
              Es la diferencia entre pulsar y decidir. */}
          <p className="text-xs text-muted-foreground">{costeEnPalabras(estado)}</p>
        </div>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onPedir}>
          <Wand2 /> Retocar esta foto
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Genera una foto nueva a partir de esta. Es lo caro de la pantalla y lo único que
        cambia lo que ve un comprador: se pide foto a foto, nunca en lote.
      </p>
    </section>
  );
}
