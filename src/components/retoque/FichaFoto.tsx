import { useEffect, useRef, useState } from 'react';
import { Check, Crop, SunMedium, TriangleAlert, Undo2, Wand2, X } from 'lucide-react';

import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Textarea,
} from '@/components/ui';
import { ApiError, type MediaImage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useDebounced } from '@/lib/useFetch';
import {
  costeEnPalabras,
  dolares,
  estadoRevelado,
  KIND_TONO,
  precioRetoque,
  retoque as apiRetoque,
  superficiePerdida,
  type Encuadre,
  type EstadoRetoque,
  type PrevioRetoque,
  type PropuestaImagen,
  type Retoque,
} from '@/lib/retoque';
import { Comparador } from './Comparador';
import { ListasPropuesta } from './Propuesta';
import { Recorte } from './Recorte';

/**
 * Una foto, con todo lo que se puede hacer con ella.
 *
 * Se abre desde la rejilla y no es una pantalla aparte a propósito: el asesor
 * ya está mirando las fotos del inmueble cuando decide que una no le gusta, y
 * mandarlo a otra ruta le haría perder el sitio.
 *
 * Lo que ordena el contenido, de arriba abajo, es cuánto compromete cada cosa:
 * primero lo que ya pasó y no costó nada (el revelado, reversible), después el
 * recorte (gratis, pero cambia el encuadre) y al final lo único que gasta
 * dinero y puede cambiar lo que hay en la foto (el retoque con IA). Puesto al
 * revés, el botón caro sería lo primero que se ve.
 *
 * La regla que atraviesa las tres: entre el botón y la foto publicada hay
 * siempre un par de ojos. En el recorte porque se probó y varios recortes que
 * sonaban razonables salían peor; en el retoque porque genera píxeles que no
 * estaban y lo va a ver un comprador.
 */
export function FichaFoto({
  propertyId,
  image,
  posicion,
  total,
  encuadre,
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
  /** Solo la GEOMETRIA del recorte: cuánto y de qué borde. Para dibujarlo. */
  encuadre: Encuadre | null;
  /** Las dos listas, ya partidas por el servidor. */
  propuesta: PropuestaImagen | null;
  /**
   * Lo que `/image-ai/status` dice del retoque: si hay clave del proveedor y
   * los dos costes con los que se arma la frase. `null` si el módulo no está.
   */
  estadoRetoque: EstadoRetoque | null;
  editable: boolean;
  onClose: () => void;
  /** La rejilla y la galería de arriba tienen que repintarse. */
  onCambio: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [viendoRecorte, setViendoRecorte] = useState(false);
  const [historial, setHistorial] = useState<Retoque[] | null>(null);

  /*
    Mientras haya un retoque pagado y sin imagen, se vuelve a preguntar.

    `GET images/:id/retouches` es una lectura y no cuesta nada. Solo corre en
    ese estado, que hoy no se da —el POST es síncrono— pero se dará en cuanto el
    módulo pase a asíncrono, porque una edición tarda minuto y medio y eso no
    cabe en el tiempo de espera de nginx. Sin esto, el asesor se quedaría
    mirando un aviso que no cambia nunca y acabaría pulsando otra vez, y la
    segunda pulsación se paga igual que la primera.
  */
  const generando =
    historial?.some(
      (r) =>
        r.status === 'PROCESANDO' ||
        (r.status === 'PENDIENTE' && !r.retouchedSnapshot && !r.error),
    ) ?? false;
  useEffect(() => {
    if (!generando) return;
    const id = setInterval(() => {
      void apiRetoque
        .retoquesDe(image.id)
        .then((filas) => filas && setHistorial(filas))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [generando, image.id]);

  useEffect(() => {
    if (!estadoRetoque?.enabled) return;
    let vivo = true;
    apiRetoque
      .retoquesDe(image.id)
      .then((filas) => {
        if (vivo) setHistorial(filas ?? []);
      })
      .catch(() => {
        /* Que no se sepa el historial no puede tumbar el diálogo: el revelado y
           el encuadre siguen siendo útiles sin él. */
        if (vivo) setHistorial([]);
      });
    return () => {
      vivo = false;
    };
  }, [image.id, estadoRetoque?.enabled]);

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

  async function conCuidado(accion: () => Promise<unknown>, porDefecto: string) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      onCambio();
    } catch (err) {
      fallo(err, porDefecto);
    } finally {
      setOcupado(false);
    }
  }

  const revelado = estadoRevelado(image);
  /* El texto lo redacta la API: `g: 1.197` no es «+0,4 EV» ni nada que suene a
     cámara, es una recta, y traducirlo aquí acabaría diciendo otra cosa. */
  const ajustes = image.develop?.resumen ?? [];
  /* Solo hay cortina del revelado si hay diferencia Y se guardó el «antes». */
  const hayComparacionRevelado = revelado === 'REVELADA' && Boolean(image.urlRawLarge);
  const pendiente =
    (historial ?? []).find(
      (r) => r.status === 'PENDIENTE' || r.status === 'PROCESANDO',
    ) ?? null;
  const aplicado = (historial ?? []).find((r) => r.id === image.retouchId) ?? null;

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
          {image.aiEdited && <Badge tone="amber">Retocada con IA</Badge>}
        </DialogTitle>

        <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto">
          {error && <Alert tone="error">{error}</Alert>}

          {/*
            UNA sola imagen arriba, y la elige lo que más compromete.

            Si lo que se publica es un retoque aplicado, la vista por defecto no
            es la foto: es la comparación con la de verdad. Quien abra esta
            ficha dentro de seis meses tiene que ver de un vistazo cuánto se
            separó el anuncio del inmueble. Si no hay retoque pero sí revelado
            con diferencia, la comparación es la del revelado.

            Antes iban las dos —la foto grande y debajo el comparador—, y era
            un error: dos imágenes de media pantalla apiladas empujaban la
            propuesta y el botón de retoque fuera de la vista, y la de arriba no
            aportaba nada que no estuviera ya en la mitad derecha de la de
            abajo.
          */}
          {aplicado ? (
            <Comparador
              antes={aplicado.originalSnapshot.urlLarge}
              despues={image.urlLarge ?? image.url}
              alt={image.description ?? `Foto ${posicion}`}
              etiquetaAntes="La foto real"
              etiquetaDespues="Lo que se publica"
            />
          ) : hayComparacionRevelado ? (
            <Comparador
              antes={image.urlRawLarge!}
              despues={image.urlLarge ?? image.url}
              alt={image.description ?? `Foto ${posicion}`}
              etiquetaAntes="Sin revelar"
              etiquetaDespues="Revelada"
            />
          ) : (
            <img
              src={image.urlLarge ?? image.url}
              alt={image.description ?? `Foto ${posicion}`}
              className="max-h-[52dvh] w-full rounded-md object-contain sm:max-h-[60dvh]"
            />
          )}

          {/* --- 1. el revelado ------------------------------------------- */}
          <section className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <h4 className="flex items-center gap-1.5 text-sm font-medium">
                <SunMedium className="size-4 text-muted-foreground" aria-hidden />{' '}
                Revelado
              </h4>
              <p className="text-xs text-muted-foreground">
                {/* Tres situaciones y solo una tiene comparación que enseñar.
                    Pintar la cortina en las otras dos sería comparar la foto
                    consigo misma: peor que no comparar, porque da por
                    demostrado algo que no se ha visto. */}
                {revelado === 'SIN_REVELAR'
                  ? 'Esta foto no ha pasado por el revelado: lo que se ve es el original.'
                  : revelado === 'SIN_CAMBIOS'
                    ? 'Se miró y no hacía falta tocarla: no hay antes y después que comparar.'
                    : ajustes.length > 0
                      ? ajustes.join(' · ')
                      : 'Revelada.'}
              </p>
              {/* En su propio párrafo: `resumen` son frases sueltas sin punto
                  final, y pegarle una detrás dejaba «...tamaños reducidos La
                  cortina de arriba...» sin separación ninguna. */}
              {revelado === 'REVELADA' && !image.urlRawLarge && (
                <p className="text-xs text-muted-foreground">
                  De esta foto no se guardó la versión sin revelar, así que no se puede
                  comparar: se reveló antes de que eso existiera.
                </p>
              )}
              {hayComparacionRevelado && !aplicado && (
                <p className="text-xs text-muted-foreground">
                  La cortina de arriba es el antes y el después.
                </p>
              )}
            </div>
            {editable && revelado !== 'SIN_REVELAR' && (
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() =>
                  void conCuidado(
                    () =>
                      apiRetoque.revelar(propertyId, image.id, revelado !== 'REVELADA'),
                    'No se pudo cambiar el revelado.',
                  )
                }
              >
                <Undo2 />
                {revelado === 'REVELADA' ? 'Publicar el original' : 'Volver a revelar'}
              </Button>
            )}
          </section>

          {/* --- 2. el encuadre ------------------------------------------- */}
          {propuesta && (
            <ListasPropuesta
              sugerencias={propuesta.sugerencias}
              metricas={propuesta.metricas}
              accionAuto={
                image.crop ? (
                  /* Ya está recortada. Lo que hace falta entonces no es volver
                     a recortar, es poder deshacerlo: el servidor guarda la caja
                     y regenera desde el negativo, así que la foto entera sigue
                     estando. */
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    onClick={() =>
                      void conCuidado(
                        () => apiRetoque.deshacerRecorte(image.id),
                        'No se pudo deshacer el recorte.',
                      )
                    }
                  >
                    <Undo2 /> Deshacer el recorte
                  </Button>
                ) : (
                  encuadre &&
                  encuadre.cortes.length > 0 && (
                    /* Y este botón NO aplica: enseña. Ese es el punto entero de
                     la pieza — el recorte se ve antes de decidirlo, porque
                     leyendo la frase que lo describe no se distingue el bueno
                     del que se come una ventana. */
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViendoRecorte(true)}
                    >
                      <Crop /> Ver cómo queda
                    </Button>
                  )
                )
              }
            />
          )}

          {/* --- 3. el retoque con IA ------------------------------------- */}
          {estadoRetoque?.enabled && editable && historial !== null && (
            <BloqueRetoque
              image={image}
              pendiente={pendiente}
              aplicado={aplicado}
              historial={historial}
              estado={estadoRetoque}
              ocupado={ocupado}
              onPedir={(instruccion, asumida) =>
                void conCuidado(async () => {
                  const fila = await apiRetoque.retocar(image.id, instruccion, asumida);
                  setHistorial((previo) => [fila, ...(previo ?? [])]);
                }, 'No se pudo lanzar el retoque.')
              }
              onDecidir={(id, acepta) =>
                void conCuidado(async () => {
                  const fila = acepta
                    ? await apiRetoque.aplicar(id)
                    : await apiRetoque.descartar(id);
                  setHistorial((previo) =>
                    (previo ?? []).map((f) => (f.id === fila.id ? fila : f)),
                  );
                }, 'No se pudo guardar la decisión.')
              }
              onRevertir={(id) =>
                void conCuidado(async () => {
                  const fila = await apiRetoque.revertir(id);
                  setHistorial((previo) =>
                    (previo ?? []).map((f) => (f.id === fila.id ? fila : f)),
                  );
                }, 'No se pudo volver a la foto original.')
              }
            />
          )}
        </div>

        {viendoRecorte && encuadre && (
          <ConfirmarRecorte
            image={image}
            encuadre={encuadre}
            ocupado={ocupado}
            onClose={() => setViendoRecorte(false)}
            onAplicar={() =>
              void conCuidado(async () => {
                await apiRetoque.recortar(
                  image.id,
                  /* `aplicable` es lo que se dibujó en la previsualización.
                     Mandar `porcion` aquí sería enseñar un recorte y aplicar
                     otro, que es el fallo que este diálogo existe para evitar. */
                  encuadre.cortes.map((c) => ({ borde: c.borde, porcion: c.aplicable })),
                );
                setViendoRecorte(false);
              }, 'No se pudo aplicar el recorte.')
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * El recorte, a la vista, antes de tocar nada.
 *
 * No hay camino que aplique un recorte sin pasar por aquí. Es la única
 * salvaguarda que se sabe que funciona: sobre 23 fotos reales, los recortes que
 * salían mal no se distinguían de los buenos por su descripción, solo por su
 * resultado.
 */
function ConfirmarRecorte({
  image,
  encuadre,
  ocupado,
  onClose,
  onAplicar,
}: {
  image: MediaImage;
  encuadre: Encuadre;
  ocupado: boolean;
  onClose: () => void;
  onAplicar: () => void;
}) {
  const perdido = superficiePerdida(encuadre.cortes);
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-w-2xl gap-3 p-4">
        <DialogTitle className="pr-10 text-sm font-medium">
          Así quedaría con el recorte
        </DialogTitle>
        {/* La grande y no la miniatura: aquí se está buscando el detalle que se
            pierde, y a 560 px una ventana en el borde no se ve. */}
        <Recorte
          url={image.urlLarge ?? image.url}
          alt={image.description ?? 'Foto del inmueble'}
          cortes={encuadre.cortes}
        />
        <p className="text-xs text-muted-foreground">
          Mira lo oscurecido antes de aceptar: es lo que desaparece. Probando estas
          propuestas sobre fotos reales, varias que sonaban razonables se comían algo que
          importaba —una ventana, medio espejo—, y eso no se ve leyendo, solo mirando.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            No recortar
          </Button>
          <Button disabled={ocupado} onClick={onAplicar}>
            <Crop /> Recortar y tirar ese {perdido}%
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * El botón caro y lo que pasa después.
 *
 * Se pide con texto libre y no con un menú de acciones a propósito: un
 * desplegable convertiría «quitar la humedad del techo» en una opción oficial
 * de la agencia. Con texto libre el asesor pide lo que necesita y el servidor
 * clasifica lo que pidió — y esa clasificación llega MIENTRAS se escribe,
 * gratis, no después de haber cobrado.
 */
function BloqueRetoque({
  image,
  pendiente,
  aplicado,
  historial,
  estado,
  ocupado,
  onPedir,
  onDecidir,
  onRevertir,
}: {
  image: MediaImage;
  pendiente: Retoque | null;
  aplicado: Retoque | null;
  historial: Retoque[];
  estado: EstadoRetoque;
  ocupado: boolean;
  onPedir: (instruccion: string, asumida: boolean) => void;
  onDecidir: (id: string, acepta: boolean) => void;
  onRevertir: (id: string) => void;
}) {
  const [instruccion, setInstruccion] = useState('');
  const [asumida, setAsumida] = useState(false);
  const [previo, setPrevio] = useState<PrevioRetoque | null>(null);
  const texto = useDebounced(instruccion.trim(), 400);

  /*
    La clasificación, mientras se escribe.

    No llama al modelo y no cuesta nada, así que el aviso de «esto altera la
    realidad» puede llegar cuando todavía se puede cambiar la frase — que es el
    único momento en el que sirve de algo. Después de pagar ya no es un aviso,
    es un reproche.
  */
  useEffect(() => {
    if (texto.length < 3) {
      setPrevio(null);
      return;
    }
    let vigente = true;
    apiRetoque
      .previoRetoque(texto)
      .then((res) => {
        // La respuesta de una frase que ya no esta escrita se tira: si no, el
        // aviso puede acabar hablando de un texto anterior.
        if (vigente) setPrevio(res);
      })
      .catch(() => {
        /* Sin clasificación se sigue pudiendo pedir: el servidor la repite y
           es él quien impone la confirmación, no esta pantalla. */
      });
    return () => {
      vigente = false;
    };
  }, [texto]);

  /* Al cambiar la frase, la confirmación vuelve a cero: se asume lo que se
     leyó, no lo que se escribió después. */
  useEffect(() => setAsumida(false), [texto]);

  const bloquePendiente = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pendiente) {
      bloquePendiente.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pendiente]);

  const gastado = historial.reduce((suma, r) => suma + Number(r.costUsd || 0), 0);

  if (pendiente && pendiente.retouchedSnapshot) {
    return (
      <section
        ref={bloquePendiente}
        className="flex flex-col gap-2 rounded-md border p-3"
      >
        <p className="text-sm font-medium">
          Esto es lo que ha salido. Todavía no se publica.
        </p>
        <p className="text-xs text-muted-foreground">«{pendiente.instruction}»</p>
        <Comparador
          antes={pendiente.originalSnapshot.urlLarge}
          despues={pendiente.retouchedSnapshot.urlLarge}
          alt="Resultado del retoque con IA"
          etiquetaAntes="La foto real"
          etiquetaDespues="Retoque IA"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={ocupado}
            onClick={() => onDecidir(pendiente.id, true)}
          >
            <Check /> Publicar el retoque
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado}
            onClick={() => onDecidir(pendiente.id, false)}
          >
            <X /> Descartarlo
          </Button>
        </div>
        {/*
          El aviso que más importa de la pantalla, y va aquí y no arriba: aquí
          es donde alguien está a punto de publicar.

          No es una advertencia genérica sobre la IA. Está medido: aunque se le
          ordene explícitamente no tocar nada más, el modelo redibuja la foto
          ENTERA. En una sala real borró la cenefa tallada de un ventanal; en
          una fachada borró la marca de agua de la agencia y repintó el
          edificio. Por eso «resultado a la vista» no es un trámite: hay que
          mirar la imagen, no leer lo que dice que hizo.
        */}
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Compara la foto entera, no solo lo que pediste: el modelo la redibuja completa
            y cambia cosas que nadie le pidió. Mira los remates, las molduras y los
            marcos, que es donde inventa — en pruebas se comió la cenefa de un ventanal,
            borró la marca de agua de una fachada y convirtió una cornisa discreta en una
            moldura decorativa que en la casa no está.
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Costó {dolares(pendiente.costUsd)} y eso ya está pagado: descartarlo no lo
          devuelve. Publicarlo deja la foto marcada como retocada con IA, y se puede
          revertir después — el original se guarda entero.
        </p>
      </section>
    );
  }

  /*
    Pendiente y sin imagen: o el proveedor falló, o todavía está generando.

    Los dos casos comparten fila y se separan por `error`. Hoy el POST es
    síncrono y este estado no llega nunca, pero el módulo va a pasarse a
    asíncrono porque una edición tarda 90-100 segundos medidos y eso se muere
    en el `proxy_read_timeout` de nginx, que por defecto son 60. Escrito así, el
    día que cambie la pantalla ya lo aguanta.
  */
  if (pendiente && !pendiente.retouchedSnapshot) {
    return pendiente.status === 'FALLIDO' || pendiente.error ? (
      <Alert tone="error">
        El último intento falló: {pendiente.error} Se pagó igual (
        {dolares(pendiente.costUsd)}).
      </Alert>
    ) : (
      <Alert tone="warn">
        La IA está generando la foto. Ya está pagada: no hace falta volver a pulsar. Tarda
        cerca de minuto y medio.
      </Alert>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Wand2 className="size-4 text-muted-foreground" aria-hidden /> Retocar con IA
        </h4>
        <p className="text-xs text-muted-foreground">
          Genera una foto nueva a partir de esta. Es lo caro de la pantalla y lo único que
          puede cambiar lo que hay en la casa: se pide foto a foto, nunca en lote.
        </p>
      </div>

      {aplicado && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-sm text-amber-900">
            {/* Que esté marcada no es un detalle de la ficha: es lo que separa
                un catálogo honesto de uno que enseña casas que no existen. */}
            Lo que se publica de esta foto es un retoque: «{aplicado.instruction}»
            {aplicado.decidedAt ? `, publicado el ${dateTime(aplicado.decidedAt)}` : ''}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={KIND_TONO[aplicado.kind]}>
              {aplicado.kind === 'REVELADO'
                ? 'Revelado'
                : aplicado.kind === 'ALTERACION'
                  ? 'Altera la realidad'
                  : 'Oculta un defecto'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => onRevertir(aplicado.id)}
            >
              <Undo2 /> Volver a la foto real
            </Button>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="micro-label text-muted-foreground">Qué quieres que haga</span>
        <Textarea
          rows={2}
          value={instruccion}
          maxLength={1000}
          placeholder="La alcoba salió muy oscura, sube la luz"
          onChange={(e) => setInstruccion(e.target.value)}
        />
      </label>

      {/* La frontera, dicha mientras todavía se puede cambiar la frase. */}
      {previo && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={KIND_TONO[previo.kind]}>{previo.kindLabel}</Badge>
            {previo.motivos.map((motivo) => (
              <span key={motivo} className="text-muted-foreground">
                {motivo}
              </span>
            ))}
          </div>
          {previo.advertencia && (
            <p className="flex items-start gap-1.5 text-xs text-amber-800">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{previo.advertencia}</span>
            </p>
          )}
          {previo.requiereConfirmacion && (
            /* No es un trámite: es el campo que convierte «la herramienta me
               dejó» en una persona con nombre que dijo que sí. Queda guardado
               con quien lo pulsó. */
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={asumida}
                onChange={(e) => setAsumida(e.target.checked)}
                className="mt-0.5 size-3.5"
              />
              <span>
                Conozco este inmueble y asumo que la foto va a dejar de mostrarlo como es.
                Queda guardado que lo dije yo.
              </span>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* El coste, en el mismo bloque que el botón y antes de él. */}
        <p className="text-xs text-muted-foreground">
          {previo
            ? costeEnPalabras(estado, previo.costeOrientativoUsd)
            : 'Escribe qué quieres y te digo qué haría y cuánto cuesta, antes de gastar nada.'}
          {gastado > 0 && ` · ya se ha gastado ${dolares(gastado)} en esta foto`}
        </p>
        <Button
          size="sm"
          disabled={
            ocupado ||
            texto.length < 3 ||
            (previo?.requiereConfirmacion === true && !asumida)
          }
          onClick={() => onPedir(texto, asumida)}
        >
          <Wand2 />
          {/* La cifra en el propio botón, no solo encima: es la última cosa
              que se lee antes de gastar. Si no se sabe, no se inventa. */}
          {(previo?.costeOrientativoUsd ?? precioRetoque(estado)) !== null
            ? `Retocar por ${dolares((previo?.costeOrientativoUsd ?? precioRetoque(estado))!)}`
            : 'Retocar esta foto'}
        </Button>
      </div>

      {/* Los intentos anteriores, con lo que costaron. Una lista que solo
          enseñara los aciertos no serviría para saber lo que cuesta esto. */}
      {historial.length > 0 && (
        <ul className="flex list-none flex-col gap-1 p-0 text-xs text-muted-foreground">
          {historial.slice(0, 4).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-1.5">
              <span className="tabular">{dateTime(r.createdAt)}</span>
              <span className="min-w-0 truncate">«{r.instruction}»</span>
              <Badge tone={r.status === 'APLICADO' ? 'ink' : 'neutral'}>
                {ESTADO_TEXTO[r.status] ?? r.status}
              </Badge>
              <span className="tabular">{dolares(r.costUsd)}</span>
            </li>
          ))}
        </ul>
      )}

      {!image.aiEdited && historial.some((r) => r.status === 'REVERTIDO') && (
        <p className="text-xs text-muted-foreground">
          Esta foto estuvo retocada y se volvió a la de verdad. Lo que se publica ahora es
          una fotografía.
        </p>
      )}
    </section>
  );
}

const ESTADO_TEXTO: Record<string, string> = {
  PENDIENTE: 'sin decidir',
  APLICADO: 'publicado',
  DESCARTADO: 'descartado',
  REVERTIDO: 'revertido',
  FALLIDO: 'falló',
};
