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
                rooms={(estado.data?.rooms ?? []).map((r) => r.value)}
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

/** El encabezado de la única sección que la agencia tiene que tocar. */
const CABECERA_REGLAS = /^##\s+Reglas propias de la agencia[^\n]*\n/m;
/** Lo que viene después de esa sección y vuelve a ser armazón. */
const CABECERA_FORMATO = /^##\s+Formato de la respuesta/m;

interface PromptPartido {
  /** Todo lo de antes, incluido el encabezado de las reglas. */
  cabecera: string;
  /** Lo editable: las frases de la agencia. */
  reglas: string;
  /** El formato de la respuesta, que va DESPUÉS de lo editable. */
  formato: string;
}

/**
 * Parte el prompt en lo que se toca y lo que no.
 *
 * El servidor guarda UN texto, y esto no lo cambia: se recompone entero al
 * guardar. Lo que hace es leer los marcadores que el propio fichero ya tiene
 * —`## Reglas propias de la agencia` y `## Formato de la respuesta`— para
 * enseñar por separado lo que la agencia puede escribir sin miedo.
 *
 * El detalle que se escapa mirándolo por encima: el bloque de formato va
 * DESPUÉS del editable, así que no vale con «todo lo de detrás del marcador».
 * Hay tres trozos, no dos.
 *
 * Si una versión guardada no trae los marcadores —porque alguien la reescribió
 * entera—, devuelve `null` y la pantalla cae al editor de texto completo. Es
 * preferible a partir por donde no toca.
 */
function partir(body: string): PromptPartido | null {
  const reglas = CABECERA_REGLAS.exec(body);
  const formato = body.search(CABECERA_FORMATO);
  if (!reglas || formato === -1) return null;
  const desde = reglas.index + reglas[0].length;
  if (formato <= desde) return null;
  return {
    cabecera: body.slice(0, desde),
    reglas: body.slice(desde, formato),
    formato: body.slice(formato),
  };
}

/**
 * Los errores que hunden el análisis, con lo que costaron al medirlos.
 *
 * No son sospechas: `ia-prompt-lab` cayó en ellos en siete rondas sobre 62
 * imágenes reales, y el número es lo que convierte el aviso en algo que se
 * lee. «No inventes defectos» suena de lo más razonable; saber que bajó los
 * problemas detectados de 127 a 6 es lo que hace que alguien lo borre.
 *
 * Avisan, no bloquean: el prompt es de la agencia. Pero un cambio que deja al
 * modelo mudo no se nota mirando la pantalla —se nota en que ya nadie encuentra
 * nada— y para entonces se ha pagado un montón de análisis vacíos.
 */
const TRAMPAS: { prueba: RegExp; aviso: string }[] = [
  {
    prueba: /\b(no inventes|no te inventes|solo si est[áa]s seguro|s[ée] breve|s[ée] prudente|no exageres|ninguno si|no seas exhaustivo)\b/i,
    aviso:
      'Pedirle prudencia suele callarlo del todo. Con «ninguno si la foto está bien», los problemas detectados cayeron de 127 a 6 sobre las mismas imágenes, y en otra versión salieron 0 problemas en 36 fotos que tenían cables cruzando la fachada y tomas torcidas. Si lo dejas, mide antes y después.',
  },
  {
    prueba: /\b(vertical|horizontal|apaisad|resoluci[óo]n|nitidez|movida|borrosa|p[íi]xeles|orientaci[óo]n|exposici[óo]n|oscura|quemada)\w*/i,
    aviso:
      'La resolución, la orientación, la nitidez y la exposición ya las mide el código antes de llamar al modelo, y le llegan escritas. Pedírselas otra vez empeora el resultado: al exigirle marcar las verticales, los aciertos bajaron de 56 de 62 a 42 de 62, con 20 falsos positivos en fotos que eran apaisadas.',
  },
  {
    prueba: /\b(s[ée] generoso|punt[úu]a alto|s[ée] benevolente|no seas duro|premia)\b/i,
    aviso:
      'Aflojar la escala de calidad la inutiliza: en una prueba, un álbum de 13 fotos salió entero entre 86 y 91, y con eso no se puede ordenar nada ni elegir portada.',
  },
  {
    prueba: /\bmarca de agua\b/i,
    aviso:
      'La marca de agua tiene su propia sección arriba, en el armazón. Sin ella el modelo confundió «SERRANO INMOBILIARIA» con un teléfono de contacto en 47 de 62 imágenes. Si vas a añadir algo sobre eso, revisa que no contradiga lo de arriba.',
  },
];

function EditorPrompt({
  prompt,
  rooms,
  onSaved,
}: {
  prompt: PromptActivo;
  /** Los roles que la API acepta; lo demás se guarda como «Otra», en silencio. */
  rooms: string[];
  onSaved: () => void;
}) {
  const partes = useMemo(() => partir(prompt.active.body), [prompt.active.body]);
  /* Sin marcadores no hay dos mitades que enseñar: se edita el texto entero.
     Y quien quiera tocar el armazón teniéndolos, puede pedirlo a mano. */
  const [avanzado, setAvanzado] = useState(partes === null);
  const [reglas, setReglas] = useState(partes?.reglas ?? '');
  const [completo, setCompleto] = useState(prompt.active.body);
  const [notes, setNotes] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Lo que se va a mandar: el texto entero, siempre, se edite como se edite. */
  const body =
    avanzado || !partes ? completo : partes.cabecera + reglas + partes.formato;

  const sucio = body !== prompt.active.body;
  const largo = body.trim().length;
  const corto = largo < PROMPT_MIN;
  const pasado = largo > PROMPT_MAX;

  /** Lo que se revisa: en modo simple, solo lo que la persona ha escrito. */
  const revisado = avanzado || !partes ? completo : reglas;

  const avisos = useMemo(() => {
    const lista: string[] = [];

    for (const trampa of TRAMPAS) {
      if (trampa.prueba.test(revisado)) lista.push(trampa.aviso);
    }

    /*
      Un rol que no existe no da error: se guarda como «Otra» y nadie se entera.
      Se buscan palabras en mayúsculas de cuatro letras o más para no perseguir
      siglas sueltas ni el «JSON» del armazón.
    */
    const conocidos = new Set([...rooms, 'JSON', 'NO', 'SI', 'BLOCK', 'WARN']);
    const inventados = [
      ...new Set(
        (revisado.match(/\b[A-ZÁÉÍÓÚÑ_]{4,}\b/g) ?? []).filter((p) => !conocidos.has(p)),
      ),
    ];
    if (inventados.length) {
      lista.push(
        `${inventados.join(', ')} no ${inventados.length === 1 ? 'es una estancia' : 'son estancias'} que la API conozca. Lo que el modelo devuelva así se guardará como «Otra», sin avisar de nada.`,
      );
    }

    // Lo que solo puede romperse tocando el armazón.
    if (avanzado || !partes) {
      if (!body.toLowerCase().includes('json')) {
        lista.push(
          'El prompt ya no menciona JSON. Sin eso el modelo contesta en prosa y no se puede guardar ni un análisis: se paga la llamada y no queda nada.',
        );
      }
      if (!CABECERA_FORMATO.test(body)) {
        lista.push(
          'Ha desaparecido «Formato de la respuesta», que es donde viven el ejemplo JSON y la lista de estancias. Sin esa sección el validador no traga la respuesta.',
        );
      }
      const actuales = secciones(body);
      const perdidas = secciones(prompt.active.body).filter(
        (s) => !actuales.includes(s) && !s.startsWith('Formato de la respuesta'),
      );
      if (perdidas.length) {
        lista.push(`Han desaparecido estas secciones: ${perdidas.join(', ')}.`);
      }
    }

    return lista;
  }, [revisado, body, avanzado, partes, prompt.active.body, rooms]);

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
          {partes && !avanzado ? (
            <>
              <p className="text-sm text-muted-foreground">
                Escribe aquí los criterios de la agencia: manías de la casa, lo que en
                Bucaramanga importa y el modelo no sabe, lo que un portal exige. Una frase
                por línea, empezando por un guion. Guardar no pisa nada —cada guardado deja
                una versión— y desde el historial se vuelve atrás.
              </p>

              <Textarea
                value={reglas}
                onChange={(e) => setReglas(e.target.value)}
                /* `rows` no manda: el Textarea del sistema crece con su
                   contenido. La altura de partida se fija con un mínimo. */
                className="min-h-64 font-mono text-xs"
                placeholder={
                  '- Las fotos de piscina van siempre antes que las del gimnasio.\n- Si sale la portería del conjunto, que no vaya de portada.'
                }
              />

              {/* Lo que sostiene todo lo demás. Se enseña —no se esconde— para
                  que quien escribe arriba sepa contra qué está escribiendo. */}
              <details className="rounded-md border bg-secondary/40">
                <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium">
                  <Lock className="size-3.5" aria-hidden /> El armazón, que no hace falta
                  tocar
                </summary>
                <div className="px-3 pb-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Aquí viven el vocabulario de la casa, lo que el código ya mide y no hay
                    que preguntarle al modelo, la sección de privacidad, la escala de
                    calidad y —lo más delicado— el ejemplo de JSON y la lista de estancias,
                    que son el contrato con el servidor. Si eso se rompe, la respuesta deja
                    de entenderse y los análisis salen vacíos habiéndose pagado.
                  </p>
                  <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap">
                    {partes.cabecera}
                    {partes.formato}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      setCompleto(body);
                      setAvanzado(true);
                    }}
                    className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Editarlo de todas formas
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Estás editando el prompt entero, armazón incluido.{' '}
                {partes && (
                  <button
                    type="button"
                    onClick={() => {
                      setReglas(partir(completo)?.reglas ?? reglas);
                      setAvanzado(false);
                    }}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Volver a editar solo mis reglas
                  </button>
                )}
              </p>
              <Textarea
                value={completo}
                onChange={(e) => setCompleto(e.target.value)}
                className="min-h-96 font-mono text-xs"
              />
            </>
          )}

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
              Llevas {largo.toLocaleString('es-CO')} caracteres y el tope son{' '}
              {PROMPT_MAX.toLocaleString('es-CO')}. Por encima de eso el modelo deja de
              leerlo entero y se salta las instrucciones del medio.
            </Alert>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <Field
            label="Por qué lo cambias"
            hint="Se guarda con la versión; es lo que hace legible el historial"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej.: que las fotos de piscina no vayan de portada"
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
                ? `${largo.toLocaleString('es-CO')} / ${PROMPT_MAX.toLocaleString('es-CO')} en total`
                : 'Sin cambios sin guardar'}
            </span>
          </div>

          {/* Dos pasadas idénticas del mismo prompt sobre las mismas fotos
              dieron cuatro hallazgos de privacidad y cero. Con una sola no se
              distingue una mejora de la suerte. */}
          <Alert tone="warn">
            El modelo no contesta igual dos veces: la misma pregunta sobre las mismas fotos
            dio cuatro hallazgos de privacidad en una pasada y ninguno en la siguiente. Un
            cambio no se puede juzgar con una prueba — lánzalo dos veces sobre las mismas
            imágenes de muestra antes de darlo por bueno.
          </Alert>

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
