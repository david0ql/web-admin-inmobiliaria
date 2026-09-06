import { useMemo, useState } from 'react';
import { History, Lock, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckField,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  Textarea,
} from '../components/ui';
import { ApiError, type Property } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { dateTime } from '../lib/format';
import {
  imagenesIA,
  PERFIL_LABEL,
  PROMPT_MAX,
  PROMPT_MIN,
  UMBRALES_ORDEN,
  UMBRAL_TEXTO,
  type EstadoImagenesIA,
  type PerfilDescrito,
  type PromptActivo,
  type UmbralesPuerta,
  type VersionPrompt,
} from '../lib/imagenes-ia';
import { cn } from '../lib/utils';

const PILL =
  'h-9 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-secondary';
const PILL_ON = 'border-primary bg-primary text-primary-foreground hover:bg-primary/90';

type Pestana = 'prompt' | 'historial' | 'puerta';

/**
 * El taller del análisis de fotos.
 *
 * Aquí se afina lo que la IA mira, y lo que se le exige a una foto antes de
 * llegar a la IA. Son cosas distintas y por eso son pestañas y no una pantalla
 * larga: el prompt se toca a menudo, el historial se mira cuando algo salió
 * peor que antes, y los umbrales se ponen una vez y se olvidan.
 */
export function ImagenesIA() {
  const [pestana, setPestana] = useState<Pestana>('prompt');
  const estado = useFetch<EstadoImagenesIA>((signal) => imagenesIA.estado(signal), []);
  const prompt = useFetch<PromptActivo>((signal) => imagenesIA.prompt(signal), []);

  return (
    <>
      <PageHeader
        eyebrow="Fotos"
        title="Revisión con IA"
        actions={
          <div className="flex gap-1.5">
            {(
              [
                ['prompt', 'Prompt'],
                ['historial', 'Historial'],
                ['puerta', 'La puerta'],
              ] as const
            ).map(([clave, texto]) => (
              <button
                key={clave}
                type="button"
                className={cn(PILL, pestana === clave && PILL_ON)}
                onClick={() => setPestana(clave)}
              >
                {texto}
              </button>
            ))}
          </div>
        }
      />

      <PageBody>
        {/* Sin clave del proveedor, el prompt se puede editar pero no se puede
            probar nada: mejor decirlo arriba que dejar que se descubra al
            pulsar y recibir un error. */}
        {estado.data?.enabled === false && (
          <Alert tone="warn">
            El análisis está apagado en este servidor: falta la clave del proveedor. Lo de
            aquí se puede leer y guardar, pero no se ejecutará hasta que se configure.
          </Alert>
        )}

        {pestana === 'prompt' && (
          <>
            {prompt.loading && <Loading rows={6} />}
            {prompt.error && <ErrorNote onRetry={prompt.reload}>{prompt.error}</ErrorNote>}
            {prompt.data && (
              <EditorPrompt
                key={prompt.data.active.version}
                prompt={prompt.data}
                onSaved={prompt.reload}
              />
            )}
          </>
        )}

        {pestana === 'historial' && (
          <Historial
            activa={prompt.data?.active.version ?? null}
            onRestored={prompt.reload}
          />
        )}

        {pestana === 'puerta' && <Puerta />}
      </PageBody>
    </>
  );
}

// --- pestaña 1: el prompt ---------------------------------------------------

/** Los títulos de sección `## ...` que tiene un texto. */
function secciones(texto: string): string[] {
  return [...texto.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
}

/**
 * El trozo que fija el formato de la respuesta.
 *
 * Se localiza por su título en el texto de fábrica, no se guarda aparte: el
 * servidor guarda UN prompt entero y partirlo en dos campos aquí sería
 * inventarse una estructura que la API no tiene. Lo que sí se puede hacer —y es
 * lo que hace falta— es enseñar cuál es ese trozo y avisar si desaparece.
 */
function armazon(texto: string): string | null {
  const desde = texto.search(/^##\s+Formato de la respuesta/m);
  return desde === -1 ? null : texto.slice(desde);
}

function EditorPrompt({ prompt, onSaved }: { prompt: PromptActivo; onSaved: () => void }) {
  const [body, setBody] = useState(prompt.active.body);
  const [notes, setNotes] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sucio = body !== prompt.active.body;
  const largo = body.trim().length;

  const marco = useMemo(
    () => armazon(prompt.repositoryDefault),
    [prompt.repositoryDefault],
  );

  /*
    Los tres avisos que valen la pena, y por qué:

    - Sin la palabra "json" en ningún sitio, el modelo devuelve prosa y el
      servidor no puede guardar nada: fallan TODOS los análisis, ya pagados.
    - Sin el bloque de formato, lo mismo por otro camino.
    - Las secciones perdidas casi siempre son un borrado accidental al
      reescribir un párrafo largo.

    Ninguno bloquea el guardado: manda quien escribe. Pero verlos antes ahorra
    una versión y una tanda de llamadas tiradas.
  */
  const avisos = useMemo(() => {
    const lista: string[] = [];
    if (!body.toLowerCase().includes('json')) {
      lista.push(
        'El prompt no menciona JSON en ningún sitio. Sin eso el modelo contesta en prosa y no se puede guardar ni un análisis.',
      );
    }
    if (marco && !/^##\s+Formato de la respuesta/m.test(body)) {
      lista.push(
        'Ha desaparecido la sección «Formato de la respuesta», que es la que le dice al modelo con qué campos contestar.',
      );
    }
    const actuales = secciones(body);
    // La de formato ya tiene su propio aviso arriba: repetirla aquí sería
    // decir dos veces lo mismo con otras palabras.
    const perdidas = secciones(prompt.active.body).filter(
      (s) => !actuales.includes(s) && !s.startsWith('Formato de la respuesta'),
    );
    if (perdidas.length) {
      lista.push(`Han desaparecido estas secciones: ${perdidas.join(', ')}.`);
    }
    return lista;
  }, [body, marco, prompt.active.body]);

  const corto = largo < PROMPT_MIN;
  const pasado = largo > PROMPT_MAX;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await imagenesIA.guardarPrompt(body, notes.trim() || undefined);
      setNotes('');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el prompt.');
    } finally {
      setGuardando(false);
    }
  }

  async function volverAFabrica() {
    setRestaurando(true);
    setError(null);
    try {
      await imagenesIA.restaurarPromptDeFabrica();
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo volver al prompt de fábrica.',
      );
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <>
      <Card
        title={
          <h3 className="micro-label flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden /> El prompt · versión{' '}
            {prompt.active.version}
          </h3>
        }
        action={
          <Button
            variant="outline"
            size="sm"
            loading={restaurando}
            onClick={() => void volverAFabrica()}
          >
            <RotateCcw /> Volver al de fábrica
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Esto es lo que se le dice al modelo antes de enseñarle las fotos. Escríbelo en
            tus palabras: qué mirar en una foto de Bucaramanga, qué es una fachada
            aceptable, qué no quieres que salga en la portada. Guardar no pisa nada —cada
            guardado deja una versión— y desde el historial se vuelve atrás.
          </p>

          {/* La mitad que no conviene tocar. Se enseña, no se esconde: quien
              edita tiene que saber qué parte es el contrato con el servidor. */}
          {marco && (
            <details className="rounded-md border bg-secondary/40">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium">
                <Lock className="size-3.5" aria-hidden /> Qué parte es el armazón
              </summary>
              <div className="px-3 pb-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Este trozo es el que fija con qué campos contesta el modelo, y el
                  servidor lo lee campo a campo para pintar la revisión. Se puede
                  reescribir —el prompt es tuyo entero—, pero si se rompe deja de
                  entenderse la respuesta y los análisis salen vacíos. Lo de arriba y lo de
                  en medio es donde se afina sin miedo.
                </p>
                <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap">
                  {marco}
                </pre>
              </div>
            </details>
          )}

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            /* `rows` no manda: el Textarea del sistema crece con su contenido
               (`field-sizing-content`), así que la altura de partida se fija con
               un mínimo. Sin esto, la pantalla de escribir arranca diminuta. */
            className="min-h-96 font-mono text-xs"
          />

          {avisos.map((aviso) => (
            <Alert key={aviso} tone="warn">
              {aviso}
            </Alert>
          ))}

          {corto && (
            <Alert tone="error">
              El servidor no acepta un prompt de menos de {PROMPT_MIN} caracteres. Si lo
              que quieres es empezar de cero, usa «Volver al de fábrica».
            </Alert>
          )}
          {pasado && (
            <Alert tone="error">
              Llevas {largo} caracteres y el tope son {PROMPT_MAX.toLocaleString('es-CO')}.
              Por encima de eso el modelo deja de leerlo entero y se salta las
              instrucciones del medio.
            </Alert>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <Field
            label="Por qué lo cambias"
            hint="Se guarda con la versión; es lo que hace legible el historial"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej.: más duro con las fotos oscuras y con la ropa tendida"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              loading={guardando}
              disabled={!sucio || corto || pasado}
              onClick={() => void guardar()}
            >
              Guardar como versión {prompt.active.version + 1}
            </Button>
            <span className="text-xs text-muted-foreground">
              {sucio
                ? `${largo.toLocaleString('es-CO')} / ${PROMPT_MAX.toLocaleString('es-CO')}`
                : 'Sin cambios sin guardar'}
            </span>
          </div>

          <p className="note">
            La versión en uso se guardó el {dateTime(prompt.active.createdAt)}
            {prompt.active.notes ? ` · ${prompt.active.notes}` : ''}
          </p>
        </div>
      </Card>

      <Muestras />
    </>
  );
}

/**
 * Probar el prompt sin tocar el inventario.
 *
 * El análisis se ejecuta siempre con la versión activa —no hay forma de probar
 * un texto sin guardarlo, ni debería haberla: lo que se prueba tiene que ser lo
 * que luego corre—. Así que probar es esto: guardas una versión, la lanzas
 * sobre un inmueble de mentira, y si sale peor vuelves atrás desde el
 * historial. Sin inmuebles de muestra, afinar significaría gastar llamadas
 * sobre fichas reales.
 */
function Muestras() {
  const { data, error, loading, reload } = useFetch<Property[]>(
    (signal) => imagenesIA.muestras(signal),
    [],
  );
  const [creando, setCreando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function crear() {
    setCreando(true);
    setFallo(null);
    try {
      await imagenesIA.crearMuestras(3);
      reload();
    } catch (err) {
      setFallo(
        err instanceof ApiError
          ? err.message
          : 'No se pudieron crear los inmuebles de muestra.',
      );
    } finally {
      setCreando(false);
    }
  }

  async function borrar() {
    setBorrando(true);
    setFallo(null);
    try {
      await imagenesIA.borrarMuestras();
      reload();
    } catch (err) {
      setFallo(err instanceof ApiError ? err.message : 'No se pudieron borrar.');
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Card
      title="Probarlo sin tocar el inventario"
      action={
        (data?.length ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            loading={borrando}
            onClick={() => void borrar()}
          >
            <Trash2 /> Borrar los de muestra
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          El análisis se ejecuta siempre con la versión guardada, así que afinar es:
          guardas, lanzas sobre un inmueble de muestra, miras el resultado y, si empeoró,
          vuelves atrás desde el historial. Los de muestra quedan en borrador y con el
          código empezando por DEMO-: la base impide que salgan a la web.
        </p>

        {fallo && <Alert tone="error">{fallo}</Alert>}
        {loading && <Loading rows={2} />}
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}

        {data && data.length === 0 && (
          <Empty title="No hay inmuebles de muestra">
            Se crean tres fichas en borrador sobre las que probar el prompt sin gastar
            llamadas en un inmueble real.
            <span className="mt-3 block">
              <Button loading={creando} onClick={() => void crear()}>
                Crear 3 de muestra
              </Button>
            </span>
          </Empty>
        )}

        {data && data.length > 0 && (
          <ul className="flex list-none flex-col gap-2 p-0">
            {data.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {p.code} · {p.title}
                  </p>
                  <p className="note">
                    {p.images?.length ?? 0}{' '}
                    {(p.images?.length ?? 0) === 1 ? 'foto' : 'fotos'}
                  </p>
                </div>
                {/* El análisis se lanza en la ficha, que es donde está el botón
                    con el coste a la vista. No se duplica aquí. */}
                <Button asChild variant="outline" size="sm">
                  <Link to={`/inmuebles/${p.id}`}>Abrir y analizar</Link>
                </Button>
              </li>
            ))}
          </ul>
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
 * miedo y nadie lo afina. Volver a una versión la ACTIVA, no la copia, así que
 * «los resultados de la v3» siguen queriendo decir lo mismo antes y después.
 */
function Historial({
  activa,
  onRestored,
}: {
  activa: number | null;
  onRestored: () => void;
}) {
  const { data, error, loading, reload } = useFetch<VersionPrompt[]>(
    (signal) => imagenesIA.historialPrompt(signal),
    [activa],
  );
  const [viendo, setViendo] = useState<VersionPrompt | null>(null);
  const [activando, setActivando] = useState<number | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  async function activar(version: VersionPrompt) {
    setActivando(version.version);
    setFallo(null);
    try {
      await imagenesIA.activarPrompt(version.version);
      setViendo(null);
      reload();
      onRestored();
    } catch (err) {
      setFallo(err instanceof ApiError ? err.message : 'No se pudo activar la versión.');
    } finally {
      setActivando(null);
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
              Todavía no hay versiones guardadas.
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
                    {v.active && <Badge tone="green">En uso</Badge>}
                  </p>
                  <p className="note">{dateTime(v.createdAt)}</p>
                  {v.notes && <p className="mt-0.5 text-sm">{v.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViendo(v)}>
                    Ver
                  </Button>
                  {!v.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={activando === v.version}
                      onClick={() => void activar(v)}
                    >
                      <RotateCcw /> Volver a esta
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
          title={`Prompt v${viendo.version}`}
          onClose={() => setViendo(null)}
          wide
          footer={
            <>
              <Button variant="outline" onClick={() => setViendo(null)}>
                Cerrar
              </Button>
              {!viendo.active && (
                <Button
                  loading={activando === viendo.version}
                  onClick={() => void activar(viendo)}
                >
                  <History /> Volver a esta versión
                </Button>
              )}
            </>
          }
        >
          {viendo.notes && <p className="mb-3 text-sm">{viendo.notes}</p>}
          <pre className="text-xs whitespace-pre-wrap">{viendo.body}</pre>
        </Modal>
      )}
    </>
  );
}

// --- pestaña 3: la puerta de código -----------------------------------------

/**
 * Lo que se le exige a una foto antes de gastar nada en IA.
 *
 * Dos perfiles y no uno: lo que sube el equipo para publicar y lo que manda un
 * propietario desde el móvil no se pueden medir con el mismo listón. Al
 * propietario un listón alto le cierra la puerta, y lo que está haciendo es
 * pedir que le llamen, no publicar un anuncio.
 */
function Puerta() {
  const { data, error, loading, reload } = useFetch<PerfilDescrito[]>(
    (signal) => imagenesIA.puerta(signal),
    [],
  );

  if (loading) return <Loading rows={6} />;
  if (error || !data) return <ErrorNote onRetry={reload}>{error}</ErrorNote>;

  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Esto se mide con código, no con el modelo: es rápido, es exacto y no cuesta nada.
        Una foto que no pase no entra, y quien la sube ve el motivo escrito. Lo que se deja
        en el valor de fábrica se queda al día con lo que se mida sobre el inventario en el
        futuro; lo que se toca, no.
      </p>
      {data.map((perfil) => (
        <PerfilPuertaCard key={perfil.profile} perfil={perfil} onSaved={reload} />
      ))}
    </>
  );
}

function PerfilPuertaCard({
  perfil,
  onSaved,
}: {
  perfil: PerfilDescrito;
  onSaved: () => void;
}) {
  const [cambios, setCambios] = useState<Record<string, number | boolean | null>>({});
  const [guardando, setGuardando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  /* Un cambio a `null` es "vuelve al de fábrica": en pantalla se enseña ya el
     valor de fábrica, que es lo que va a quedar al guardar. */
  const valor = (clave: keyof UmbralesPuerta) => {
    if (!(clave in cambios)) return perfil.effective[clave];
    const puesto = cambios[clave];
    return puesto === null ? perfil.defaults[clave] : puesto;
  };

  const sucio = Object.keys(cambios).length > 0;

  async function guardar() {
    setGuardando(true);
    setFallo(null);
    try {
      await imagenesIA.guardarPuerta(perfil.profile, cambios);
      setCambios({});
      onSaved();
    } catch (err) {
      setFallo(
        err instanceof ApiError ? err.message : 'No se pudieron guardar los umbrales.',
      );
    } finally {
      setGuardando(false);
    }
  }

  async function reiniciar() {
    setReiniciando(true);
    setFallo(null);
    try {
      await imagenesIA.reiniciarPuerta(perfil.profile);
      setCambios({});
      onSaved();
    } catch (err) {
      setFallo(err instanceof ApiError ? err.message : 'No se pudo volver a fábrica.');
    } finally {
      setReiniciando(false);
    }
  }

  return (
    <Card
      title={
        <h3 className="micro-label flex items-center gap-2">
          {PERFIL_LABEL[perfil.profile]}
          {perfil.overridden.length > 0 && (
            <Badge tone="amber">
              {perfil.overridden.length}{' '}
              {perfil.overridden.length === 1 ? 'umbral tocado' : 'umbrales tocados'}
            </Badge>
          )}
        </h3>
      }
      action={
        perfil.overridden.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            loading={reiniciando}
            onClick={() => void reiniciar()}
          >
            <RotateCcw /> Todo a fábrica
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {UMBRALES_ORDEN.map((clave) => {
            const texto = UMBRAL_TEXTO[clave];
            const tocado = perfil.overridden.includes(clave) && !(clave in cambios);
            const fabrica = perfil.defaults[clave];

            if (typeof fabrica === 'boolean') {
              return (
                <div key={clave} className="flex flex-col gap-1">
                  <CheckField
                    label={texto.label}
                    checked={valor(clave) as boolean}
                    onChange={(e) =>
                      setCambios((c) => ({ ...c, [clave]: e.target.checked }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {texto.ayuda}
                    {tocado && (
                      <PieDeFabrica
                        valor={fabrica ? 'sí' : 'no'}
                        onVolver={() => setCambios((c) => ({ ...c, [clave]: null }))}
                      />
                    )}
                  </span>
                </div>
              );
            }

            return (
              <Field
                key={clave}
                label={texto.label}
                type="number"
                step={texto.paso ?? 1}
                value={valor(clave) as number}
                onChange={(e) =>
                  setCambios((c) => ({ ...c, [clave]: Number(e.target.value) }))
                }
                hint={
                  <>
                    {texto.ayuda}
                    {tocado && (
                      <PieDeFabrica
                        valor={String(fabrica)}
                        onVolver={() => setCambios((c) => ({ ...c, [clave]: null }))}
                      />
                    )}
                  </>
                }
              />
            );
          })}
        </div>

        {fallo && <Alert tone="error">{fallo}</Alert>}

        <div className="flex items-center gap-3">
          <Button loading={guardando} disabled={!sucio} onClick={() => void guardar()}>
            Guardar
          </Button>
          {sucio && (
            <button
              type="button"
              onClick={() => setCambios({})}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Descartar los cambios
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Un umbral tocado enseña el de fábrica y cómo volver a él en un clic. */
function PieDeFabrica({ valor, onVolver }: { valor: string; onVolver: () => void }) {
  return (
    <span className="mt-0.5 block">
      De fábrica: {valor}.{' '}
      <button
        type="button"
        onClick={onVolver}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Volver a ese
      </button>
    </span>
  );
}
