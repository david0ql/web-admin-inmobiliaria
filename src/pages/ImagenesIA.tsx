import { useState } from 'react';
import { History, Lock, RotateCcw, Sparkles } from 'lucide-react';

import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckField,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  Textarea,
} from '../components/ui';
import { FichaVeredicto } from '../components/imagenes-ia/RevisionImagenes';
import { ApiError, api, type Property } from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { dateTime } from '../lib/format';
import {
  imagenesIA,
  type PromptImagenes,
  type ReglasTecnicas,
  type VeredictoImagen,
  type VersionPrompt,
} from '../lib/imagenes-ia';
import { cn } from '../lib/utils';

const PILL =
  'h-9 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-secondary';
const PILL_ON = 'border-primary bg-primary text-primary-foreground hover:bg-primary/90';

/** Cuántas fotos como mucho se mandan en una prueba: es dinero, no un botón. */
const MAX_PRUEBA = 4;

type Pestana = 'prompt' | 'historial' | 'reglas';

/**
 * El taller del análisis de fotos.
 *
 * Aquí se afina lo que la IA mira y lo que se le exige a una foto antes de
 * llegar a la IA. Son tres cosas distintas y por eso son tres pestañas y no
 * una pantalla larga: el prompt se toca a menudo, el historial se mira cuando
 * algo salió peor que antes, y las reglas técnicas se ponen una vez.
 *
 * La idea que atraviesa la primera pestaña: el prompt tiene dos mitades que no
 * se pueden tratar igual. El armazón es el contrato con el servidor —dice en
 * qué forma tiene que contestar el modelo—, y si se rompe deja de entenderse
 * la respuesta; por eso se enseña, para que se sepa qué hay debajo, pero no se
 * edita. Las reglas son de la agencia: ahí se escribe sin miedo.
 */
export function ImagenesIA() {
  const [pestana, setPestana] = useState<Pestana>('prompt');

  const prompt = useFetch<PromptImagenes>((signal) => imagenesIA.prompt(signal), []);

  return (
    <>
      <PageHeader
        eyebrow="Fotos"
        title="Revisión con IA"
        actions={
          <div className="flex gap-1.5">
            <button
              type="button"
              className={cn(PILL, pestana === 'prompt' && PILL_ON)}
              onClick={() => setPestana('prompt')}
            >
              Prompt
            </button>
            <button
              type="button"
              className={cn(PILL, pestana === 'historial' && PILL_ON)}
              onClick={() => setPestana('historial')}
            >
              Historial
            </button>
            <button
              type="button"
              className={cn(PILL, pestana === 'reglas' && PILL_ON)}
              onClick={() => setPestana('reglas')}
            >
              Reglas técnicas
            </button>
          </div>
        }
      />

      <PageBody>
        {pestana === 'prompt' && (
          <>
            {prompt.loading && <Loading rows={6} />}
            {prompt.error && <ErrorNote onRetry={prompt.reload}>{prompt.error}</ErrorNote>}
            {prompt.data && <EditorPrompt prompt={prompt.data} onSaved={prompt.reload} />}
          </>
        )}

        {pestana === 'historial' && <Historial onRestored={prompt.reload} />}

        {pestana === 'reglas' && <ReglasTecnicasCard />}
      </PageBody>
    </>
  );
}

// --- pestaña 1: el prompt ---------------------------------------------------

function EditorPrompt({
  prompt,
  onSaved,
}: {
  prompt: PromptImagenes;
  onSaved: () => void;
}) {
  const [rules, setRules] = useState(prompt.rules);
  const [etiqueta, setEtiqueta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sucio = rules !== prompt.rules;
  const largo = rules.length;
  const pasado = largo > prompt.maxLength;

  /*
    Un aviso, no una barrera: quitar un marcador no rompe nada por sí solo
    —el servidor sustituye lo que encuentre—, pero casi siempre es un borrado
    accidental al reescribir un párrafo, y verlo a tiempo ahorra una versión.
  */
  const faltan = prompt.placeholders.filter(
    (p) => prompt.rules.includes(p) && !rules.includes(p),
  );

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await imagenesIA.guardarPrompt(rules, etiqueta.trim() || undefined);
      setEtiqueta('');
      setGuardado(true);
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el prompt.',
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Card
        title={
          <h3 className="micro-label flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden /> El armazón · no se edita
          </h3>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Esto es lo que le pide al modelo que conteste en un formato concreto: el
            servidor lee esa respuesta campo a campo para pintar la revisión. Si cambiara,
            dejaría de entenderse y el análisis no daría nada. Se enseña para que sepas
            qué hay debajo de tus reglas, que van justo después.
          </p>
          {prompt.placeholders.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Se sustituyen al vuelo:
              {prompt.placeholders.map((p) => (
                <Badge key={p} tone="blue">
                  {p}
                </Badge>
              ))}
            </p>
          )}
          {/* `details` y no un panel plegable propio: es texto de consulta, se
              abre una vez cada muchas semanas. */}
          <details className="rounded-md border bg-secondary/40">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Ver el texto completo
            </summary>
            <pre className="max-h-96 overflow-auto px-3 pb-3 text-xs whitespace-pre-wrap">
              {prompt.frame}
            </pre>
          </details>
        </div>
      </Card>

      <Card
        title={
          <h3 className="micro-label flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden /> Tus reglas · versión{' '}
            {prompt.version}
          </h3>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lo que la agencia le añade: qué mirar en una foto de Bucaramanga, qué es una
            fachada aceptable, qué no quieres que salga en la portada. Se escribe en tus
            palabras y se puede volver atrás en cualquier momento desde el historial.
          </p>

          <Textarea
            value={rules}
            onChange={(e) => {
              setRules(e.target.value);
              setGuardado(false);
            }}
            /* `rows` no manda: el Textarea del sistema crece con su contenido
               (`field-sizing-content`), asi que la altura de partida se fija
               con un minimo. Sin esto, unas reglas de tres lineas dejaban una
               caja diminuta para lo que es la pantalla de escribir. */
            className="min-h-72 font-mono text-xs"
            placeholder={
              'Ej.: La portada tiene que ser la fachada o la vista principal, nunca un baño.\nPenaliza las fotos tomadas de noche o con el flash reflejado en un espejo.'
            }
          />

          {faltan.length > 0 && (
            <Alert tone="warn">
              Has quitado {faltan.join(', ')}. Si no era a propósito, vuelve a ponerlo
              antes de guardar.
            </Alert>
          )}

          {pasado && (
            <Alert tone="error">
              El servidor acepta {prompt.maxLength} caracteres y llevas {largo}. Recorta
              antes de guardar.
            </Alert>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex flex-wrap items-center gap-3">
            <Field
              label="Nombre de esta versión"
              hint="Para reconocerla en el historial"
              className="min-w-56 flex-1"
              value={etiqueta}
              maxLength={60}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="Ej.: más duro con las fotos oscuras"
            />
            <div className="flex items-center gap-3 self-end pb-0.5">
              <Button
                loading={guardando}
                disabled={!sucio || pasado}
                onClick={() => void guardar()}
              >
                Guardar versión
              </Button>
              <span className="text-xs text-muted-foreground">
                {guardado && !sucio
                  ? 'Guardado'
                  : `${largo} / ${prompt.maxLength}`}
              </span>
            </div>
          </div>

          {prompt.updatedAt && (
            <p className="note">
              Última versión guardada el {dateTime(prompt.updatedAt)}
              {prompt.updatedBy ? ` por ${prompt.updatedBy}` : ''}
            </p>
          )}
        </div>
      </Card>

      <PruebaPrompt rules={rules} sucio={sucio} />
    </>
  );
}

/**
 * Probar el prompt antes de guardarlo.
 *
 * Sin esto, afinar es escribir a ciegas y esperar al siguiente inmueble para
 * ver si mejoró. Se prueba sobre fotos de verdad —las de un inmueble del
 * inventario— y se limita a cuatro: es una llamada por imagen y esto se usa
 * muchas veces seguidas mientras se ajusta un párrafo.
 *
 * Lo que se prueba es el texto del editor, guardado o no: ese es el punto.
 */
function PruebaPrompt({ rules, sucio }: { rules: string; sucio: boolean }) {
  const [q, setQ] = useState('');
  const [elegido, setElegido] = useState<Property | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [resultado, setResultado] = useState<VeredictoImagen[] | null>(null);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(q);

  const busqueda = useFetch<{ data: Property[] }>(
    (signal) =>
      debounced.trim().length < 2
        ? Promise.resolve({ data: [] })
        : api.get<{ data: Property[] }>('/properties', { q: debounced, limit: 6 }, signal),
    [debounced],
  );

  function alternar(id: string) {
    setSeleccion((previa) =>
      previa.includes(id)
        ? previa.filter((x) => x !== id)
        : previa.length >= MAX_PRUEBA
          ? previa
          : [...previa, id],
    );
  }

  async function probar() {
    setProbando(true);
    setError(null);
    try {
      const res = await imagenesIA.probar(rules, seleccion);
      setResultado(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo probar el prompt.');
    } finally {
      setProbando(false);
    }
  }

  return (
    <Card title="Probarlo antes de guardar">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Se prueba con el texto que tienes ahora en el editor
          {sucio ? ', incluidos los cambios sin guardar' : ''}. Elige un inmueble y hasta{' '}
          {MAX_PRUEBA} de sus fotos: cada foto es una llamada que se paga, y no se guarda
          nada del resultado.
        </p>

        <Field
          label="Inmueble"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setElegido(null);
            setSeleccion([]);
            setResultado(null);
          }}
          placeholder="Título, dirección o código"
        />

        {!elegido && (busqueda.data?.data.length ?? 0) > 0 && (
          <ul className="flex list-none flex-col gap-1 p-0">
            {busqueda.data?.data.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setElegido(p);
                    setSeleccion(p.images.slice(0, MAX_PRUEBA).map((i) => i.id));
                    setResultado(null);
                  }}
                  className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span className="font-medium">{p.code}</span> · {p.title}
                  <span className="note ml-1">
                    {p.images.length} {p.images.length === 1 ? 'foto' : 'fotos'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Con la lista de resultados ya cerrada, sin esto no se ve sobre qué
            inmueble se está probando: el buscador conserva lo tecleado, que no
            es lo mismo que lo elegido. */}
        {elegido && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{elegido.code}</span> · {elegido.title}
            <button
              type="button"
              onClick={() => {
                setElegido(null);
                setSeleccion([]);
                setResultado(null);
              }}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Elegir otro
            </button>
          </p>
        )}

        {elegido && elegido.images.length === 0 && (
          <Alert tone="warn">
            {elegido.code} no tiene fotos. Elige otro inmueble para probar.
          </Alert>
        )}

        {elegido && elegido.images.length > 0 && (
          <>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(110px,1fr))]">
              {elegido.images.map((img) => {
                const puesta = seleccion.includes(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => alternar(img.id)}
                    aria-pressed={puesta}
                    className={cn(
                      'relative m-0 aspect-[4/3] overflow-hidden rounded-md border-2',
                      puesta ? 'border-primary' : 'border-transparent opacity-60',
                    )}
                  >
                    <img
                      src={img.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </button>
                );
              })}
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                loading={probando}
                disabled={seleccion.length === 0}
                onClick={() => void probar()}
              >
                Probar con {seleccion.length}{' '}
                {seleccion.length === 1 ? 'foto' : 'fotos'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Máximo {MAX_PRUEBA}. Cada foto es una llamada que se cobra.
              </span>
            </div>
          </>
        )}

        {resultado && (
          <>
            <p className="text-xs text-muted-foreground">
              Resultado de la prueba. No se ha guardado ni ha tocado la ficha del
              inmueble.
            </p>
            <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {[...resultado]
                .sort((a, b) => a.suggestedPosition - b.suggestedPosition)
                .map((item, i) => (
                  <FichaVeredicto key={item.imageId} item={item} propuesto={i + 1} />
                ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

// --- pestaña 2: el historial ------------------------------------------------

/**
 * Todas las versiones del prompt, con vuelta atrás.
 *
 * Es la red de seguridad de la pestaña anterior: sin ella, tocar el prompt da
 * miedo y nadie lo afina. Restaurar no borra nada — crea una versión nueva con
 * el texto de la vieja, así que el historial sigue siendo el relato completo.
 */
function Historial({ onRestored }: { onRestored: () => void }) {
  const { data, error, loading, reload } = useFetch<VersionPrompt[]>(
    (signal) => imagenesIA.versiones(signal),
    [],
  );
  const [viendo, setViendo] = useState<VersionPrompt | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  async function restaurar(version: VersionPrompt) {
    setRestaurando(version.id);
    setFallo(null);
    try {
      await imagenesIA.restaurar(version.id);
      setViendo(null);
      reload();
      onRestored();
    } catch (err) {
      setFallo(err instanceof ApiError ? err.message : 'No se pudo restaurar la versión.');
    } finally {
      setRestaurando(null);
    }
  }

  if (loading) return <Loading rows={5} />;
  if (error || !data) return <ErrorNote onRetry={reload}>{error}</ErrorNote>;

  return (
    <>
      <Card title={`Versiones del prompt · ${data.length}`}>
        <div className="flex flex-col gap-3">
          {fallo && <Alert tone="error">{fallo}</Alert>}
          {data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay versiones guardadas. La primera se crea al guardar tus reglas.
            </p>
          )}
          <ul className="flex list-none flex-col gap-2 p-0">
            {data.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    v{v.version}
                    {v.label && <span className="font-normal">· {v.label}</span>}
                    {v.isCurrent && <Badge tone="green">En uso</Badge>}
                  </p>
                  <p className="note">
                    {dateTime(v.createdAt)}
                    {v.authorName ? ` · ${v.authorName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViendo(v)}>
                    Ver
                  </Button>
                  {!v.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={restaurando === v.id}
                      onClick={() => void restaurar(v)}
                    >
                      <RotateCcw /> Restaurar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {viendo && (
        <Modal
          title={`Prompt v${viendo.version}${viendo.label ? ` · ${viendo.label}` : ''}`}
          onClose={() => setViendo(null)}
          wide
          footer={
            <>
              <Button variant="outline" onClick={() => setViendo(null)}>
                Cerrar
              </Button>
              {!viendo.isCurrent && (
                <Button
                  loading={restaurando === viendo.id}
                  onClick={() => void restaurar(viendo)}
                >
                  <History /> Volver a esta versión
                </Button>
              )}
            </>
          }
        >
          <pre className="text-xs whitespace-pre-wrap">{viendo.rules}</pre>
        </Modal>
      )}
    </>
  );
}

// --- pestaña 3: las reglas técnicas -----------------------------------------

/**
 * La puerta de antes de la IA.
 *
 * Se aplica a todo el mundo: al asesor que sube desde el panel y al propietario
 * que manda una consignación desde la web. Por eso vale la pena ajustarla aquí
 * y no en un fichero de configuración del servidor — el día que la agencia
 * decida que 1200 px es poco, lo cambia quien lo decide.
 */
function ReglasTecnicasCard() {
  const { data, error, loading, reload } = useFetch<ReglasTecnicas>(
    (signal) => imagenesIA.reglas(signal),
    [],
  );
  const [form, setForm] = useState<ReglasTecnicas | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const valores = form ?? data;

  function set<K extends keyof ReglasTecnicas>(clave: K, valor: ReglasTecnicas[K]) {
    if (!valores) return;
    setForm({ ...valores, [clave]: valor });
    setGuardado(false);
  }

  async function guardar() {
    if (!valores) return;
    setGuardando(true);
    setFallo(null);
    try {
      await imagenesIA.guardarReglas(valores);
      setGuardado(true);
      reload();
    } catch (err) {
      setFallo(err instanceof ApiError ? err.message : 'No se pudieron guardar las reglas.');
    } finally {
      setGuardando(false);
    }
  }

  if (loading) return <Loading rows={5} />;
  if ((error && !valores) || !valores) return <ErrorNote onRetry={reload}>{error}</ErrorNote>;

  return (
    <Card title="Lo que se le exige a una foto">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Se comprueba en el servidor al subir, antes de gastar nada en IA. Una foto que no
          pase no entra, y quien la sube ve el motivo escrito.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Ancho mínimo (px)"
            type="number"
            min={200}
            value={valores.minWidth}
            onChange={(e) => set('minWidth', Number(e.target.value))}
          />
          <Field
            label="Alto mínimo (px)"
            type="number"
            min={200}
            value={valores.minHeight}
            onChange={(e) => set('minHeight', Number(e.target.value))}
          />
          <Field
            label="Peso máximo (MB)"
            type="number"
            min={1}
            hint="Lo que acepta el servidor por fichero"
            value={Math.round(valores.maxBytes / 1_048_576)}
            onChange={(e) => set('maxBytes', Number(e.target.value) * 1_048_576)}
          />
          <Field
            label="Mínimo de fotos"
            type="number"
            min={0}
            hint="Por debajo, el inmueble no se publica"
            value={valores.minImages}
            onChange={(e) => set('minImages', Number(e.target.value))}
          />
        </div>

        <CheckField
          label="Exigir foto horizontal"
          checked={valores.requireLandscape}
          onChange={(e) => set('requireLandscape', e.target.checked)}
        />
        <p className="-mt-2 text-xs text-muted-foreground">
          Las fichas y los portales enseñan las fotos apaisadas: una vertical sale recortada
          por arriba y por abajo.
        </p>

        <div>
          <span className="micro-label text-muted-foreground">Formatos que entran</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {valores.allowedFormats.map((f) => (
              <Badge key={f}>{f.toUpperCase()}</Badge>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Se decide por los bytes del fichero, no por su extensión. Cambiar la lista es
            cosa del servidor.
          </p>
        </div>

        {fallo && <Alert tone="error">{fallo}</Alert>}

        <div className="flex items-center gap-3">
          <Button loading={guardando} onClick={() => void guardar()}>
            Guardar reglas
          </Button>
          {guardado && <span className="note">Guardado</span>}
        </div>
      </div>
    </Card>
  );
}
