import { ApiError, api, type MediaImage } from './api';

/**
 * Lo que se le hace a una foto después de subirla, visto desde el panel.
 *
 * Son tres cosas distintas que la pantalla junta y que conviene no confundir:
 *
 * - El **revelado** es código: niveles, balance de blancos y gamma. No inventa
 *   nada, no cuesta nada y se aplica solo al subir. Lo único que hace falta de
 *   él es poder deshacerlo.
 * - El **encuadre** es un diagnóstico: qué habría que recortar de esta foto y
 *   qué no tiene arreglo sin volver a la casa. Viene dentro del análisis, no en
 *   un módulo aparte.
 * - El **retoque con IA** genera píxeles que no estaban. Cuesta unas cien veces
 *   el análisis, cambia la foto que ve un comprador, y por eso no pasa sin que
 *   una persona diga que sí dos veces: una para pagarlo y otra para publicarlo.
 *
 * Vive aparte de `imagenes-ia.ts` —que es el veredicto del modelo sobre la
 * galería— porque el vocabulario no se solapa: allí se habla de estancias,
 * portadas y privacidad; aquí de recortes, coste y marcha atrás.
 *
 * Y no toca `imagenes-ia.ts` para leer el encuadre, aunque el encuadre viaje
 * dentro de esa misma respuesta: ese fichero lo está reescribiendo otro agente
 * ahora mismo, y añadirle un campo era garantizarse un choque. `encuadreDe()`
 * lo saca de la fila sin que aquel módulo tenga que enterarse.
 */

const BASE = '/image-ai';

/**
 * Una llamada que puede no existir todavía.
 *
 * `null` significa exactamente «este servidor no sabe hacer esto». Cualquier
 * otro error se deja pasar: un 500 o un 403 SÍ hay que enseñarlos, porque son
 * algo que va mal, no algo que aún no está.
 */
async function opcional<T>(llamada: Promise<T>): Promise<T | null> {
  try {
    return await llamada;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// --- la propuesta: las dos listas, ya partidas por el servidor -------------

/**
 * A quien va dirigida una sugerencia. Es el campo que parte la pantalla en dos.
 *
 * Lo decide el servidor por construccion y no un diccionario de aqui, y tiene
 * una prueba que lo fija: si el panel lo dedujera del `codigo`, un codigo nuevo
 * caeria en el cubo equivocado SIN dar error. Y el cubo equivocado es o
 * prometer que un boton arregla lo que necesita una camara, o mandar a alguien
 * a cruzar Bucaramanga por algo que se resolvia mirando la foto.
 *
 * A `AUTO` solo llega un recorte que el codigo ha confirmado midiendo los
 * pixeles del borde. Todo lo demas —las tareas, las fotos a repetir y los
 * recortes que el modelo propuso sin que el codigo los confirme— es `REVISITA`.
 */
export type Destino = 'AUTO' | 'REVISITA';

export type Severidad = 'ALTA' | 'MEDIA' | 'BAJA';

export interface Sugerencia {
  /** Estable entre llamadas: se compone del analisis y de lo que describe. */
  id: string;
  destino: Destino;
  /** Solo elige el icono. Uno desconocido pinta el generico y no rompe nada. */
  codigo: string;
  /** Una linea en español. Es lo que se lee. */
  titulo: string;
  detalle: string | null;
  severidad: Severidad;
}

/**
 * Lo medido de la foto. Va al lado de la frase para que se pueda discutir.
 *
 * Con una advertencia que hay que respetar al pintarlo: la nitidez tiene un
 * falso positivo sistematico en este inventario —las salas VACIAS de pared
 * blanca lisa hunden la varianza del laplaciano y puntuan como movidas estando
 * perfectamente enfocadas—. Por eso este numero se enseña como dato y nunca se
 * convierte aqui en un veredicto de «movida»: quien decide eso es el servidor,
 * que ademas antepone «oscura» por el mismo motivo.
 */
export interface MetricasImagen {
  anchura: number;
  altura: number;
  /** Ancho partido por alto. Da poco juego: 6.005 de las 6.306 fotos son 3:2. */
  aspecto: number;
  nitidez: number | null;
  brillo: number | null;
}

export interface PropuestaImagen {
  propertyImageId: string;
  metricas: MetricasImagen | null;
  sugerencias: Sugerencia[];
}

export interface RevisionPropuesta {
  images: PropuestaImagen[];
  /** Fecha del analisis mas reciente, o null si no hay ninguno. */
  generatedAt: string | null;
}

/** Parte las sugerencias por su destino, conservando el orden del servidor. */
export function partir(sugerencias: Sugerencia[]) {
  return {
    auto: sugerencias.filter((s) => s.destino === 'AUTO'),
    revisita: sugerencias.filter((s) => s.destino === 'REVISITA'),
  };
}

// --- el encuadre: qué recortar y qué no tiene arreglo -----------------------

/** Los cuatro bordes, como los nombra el servidor. */
export type Borde = 'ARRIBA' | 'ABAJO' | 'IZQUIERDA' | 'DERECHA';

/**
 * En que deja el encuadre a la foto.
 *
 * El encuadre sigue leyendose aunque las listas vengan ya partidas de
 * `/propuesta`: es lo unico que trae la GEOMETRIA del recorte —cuanto y de que
 * borde—, y sin eso no se puede dibujar como va a quedar la foto. Las
 * sugerencias traen la frase; esto trae los numeros.
 */
export type Via = 'PROGRAMA' | 'ASESOR' | 'REPETIR' | 'NADA';

/** Lo que el modelo propone recortar de un borde, contrastado con lo medido. */
export interface Corte {
  borde: Borde;
  /** Lo que estima el modelo, en porcentaje del lado. */
  porcion: number;
  /** Qué hay en ese borde, en palabras del modelo. Es lo rebatible. */
  que: string;
  /** Lo que mide el código de franja plana en ese mismo borde. */
  medido: number;
  /**
   * Lo que se va a recortar DE VERDAD, y por tanto lo único que se dibuja y se
   * manda. `porcion` y `medido` son para poder explicar y para poder dudar.
   *
   * No es lo mismo que `medido` y la diferencia no es pequeña: la galería pinta
   * las fotos con `object-cover` sobre una caja más cuadrada que un 3:2, así que
   * el navegador vuelve a recortar por su cuenta. Midiéndolo, quitar el 35 % de
   * abajo de un 3:2 hacía que el navegador se llevara además el 24 % del ancho
   * —desaparecían la pared de la izquierda y el final de la barra de la
   * cocina—. El servidor acota cada borde a lo que cabe sin provocar eso: en un
   * 3:2 son unos 14 puntos.
   *
   * Dibujar `medido` y mandar `medido` sería enseñar un recorte y aplicar otro,
   * que es exactamente el fallo que esta pantalla existe para evitar.
   */
  aplicable: number;
  /**
   * El código confirma la franja.
   *
   * Ojo con leer esto como «se aplica solo»: en la pantalla significa «este
   * corte es de fiar», no «este corte se ejecuta sin mirarlo». La diferencia no
   * es de matiz — probando los recortes sobre 23 fotos reales, aplicados al pie
   * de la letra varios salían peor: uno perdía la ventana de una alcoba, otro
   * mordía un espejo. Y eso solo se vio renderizándolos: leyendo la frase que
   * los describe, todos parecían razonables.
   */
  auto: boolean;
}

export interface Encuadre {
  via: Via;
  cortes: Corte[];
  /** Por qué la vía es la que es, en una frase, cuando no es obvio. */
  motivo: string | null;
}

/**
 * Saca el encuadre de una fila de análisis sin acoplarse a su tipo.
 *
 * La API lo devuelve dentro de cada `AnalisisImagen` de `/image-ai/properties/
 * :id`, pero ese tipo vive en `imagenes-ia.ts` y no declara el campo. Se lee
 * defensivamente porque los análisis anteriores a que existiera no lo traen:
 * ausente es «no se preguntó», no «no hay nada que recortar».
 */
export function encuadreDe(fila: unknown): Encuadre | null {
  const marco = (fila as { framing?: Encuadre | null } | null)?.framing;
  if (!marco || !Array.isArray(marco.cortes)) return null;
  return marco;
}

/**
 * Lo que queda de la foto tras aplicar unos cortes, en porcentajes CSS.
 *
 * Es todo lo que hace falta para dibujar el recorte exacto encima de la
 * miniatura que ya está cargada: sin llamar a nadie, sin coste y sin esperar a
 * que exista la ruta que lo aplica. La previsualización no es un adorno, es la
 * única forma conocida de cazar un recorte malo — leyendo la frase no se caza.
 */
export function marco(cortes: Corte[]): {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
} {
  /* `aplicable` y no `porcion`: es lo que el servidor va a recortar. Con
     `porcion` la previsualización enseñaría un recorte y saldría otro. */
  const de = (borde: Borde) =>
    cortes.find((c) => c.borde === borde)?.aplicable ?? 0;
  return {
    arriba: de('ARRIBA'),
    abajo: de('ABAJO'),
    izquierda: de('IZQUIERDA'),
    derecha: de('DERECHA'),
  };
}

/** Cuánto de la foto se tira, en porcentaje de superficie. */
export function superficiePerdida(cortes: Corte[]): number {
  const m = marco(cortes);
  const queda =
    ((100 - m.arriba - m.abajo) / 100) * ((100 - m.izquierda - m.derecha) / 100);
  return Math.round((1 - queda) * 100);
}

export const BORDE_LABEL: Record<Borde, string> = {
  ARRIBA: 'arriba',
  ABAJO: 'abajo',
  IZQUIERDA: 'la izquierda',
  DERECHA: 'la derecha',
};

// --- el revelado ------------------------------------------------------------

/**
 * Qué se le hizo a la foto al reveladla, tal cual lo guardó el servidor.
 *
 * Nulo con `developedAt` puesto es lo mejor que puede pasar: se miró y no hacía
 * falta tocarla. Nulo con `developedAt` también nulo es «no se ha revelado».
 * Se ven igual si solo se mira este campo, y por eso hacen falta los dos.
 */
export interface Revelado {
  version: number;
  niveles?: { g: number; b: number };
  balance?: { r: number; g: number; b: number };
  gamma?: number;
}

/**
 * En que situacion esta el revelado de una foto. Son TRES y no dos.
 *
 * Distinguirlas importa porque solo una tiene comparacion que enseñar:
 *
 * - `SIN_REVELAR`: no ha pasado por el revelado. Lo que se ve YA es el antes,
 *   asi que un comparador compararia la foto consigo misma.
 * - `SIN_CAMBIOS`: se reveló y no hacia falta tocarla. Pasa en 4 de cada 150 y
 *   es lo mejor que puede pasar. Tambien aqui el antes y el despues son
 *   iguales, y lo honesto es decirlo en vez de pintar una cortina que no
 *   enseña ninguna diferencia.
 * - `REVELADA`: hay diferencia de verdad y se puede comparar.
 */
export type EstadoRevelado = 'SIN_REVELAR' | 'SIN_CAMBIOS' | 'REVELADA';

export function estadoRevelado(image: {
  developedAt?: string | null;
  develop?: unknown;
}): EstadoRevelado {
  if (!image.developedAt) return 'SIN_REVELAR';
  if (!image.develop) return 'SIN_CAMBIOS';
  return 'REVELADA';
}

// --- el retoque con IA ------------------------------------------------------

/**
 * Qué se le pidió de verdad a la IA. Es la frontera entre revelar y falsear.
 *
 * No es una etiqueta decorativa: decide si hace falta una confirmación extra y
 * con qué severidad queda marcada la foto. Un comprador va a ir a esa casa.
 */
export type RetouchKind = 'REVELADO' | 'ALTERACION' | 'OCULTA_DEFECTO';

export type RetouchStatus =
  /**
   * Pedido y pagado, pero el proveedor todavía está dibujando.
   *
   * El POST vuelve en menos de un segundo con este estado porque la edición
   * tarda unos 87 segundos, y una petición de minuto y medio no sobrevive al
   * `proxy_read_timeout` de nginx: el asesor vería un error de una llamada que
   * se cobró y que salió bien.
   */
  | 'PROCESANDO'
  | 'PENDIENTE'
  | 'APLICADO'
  | 'DESCARTADO'
  | 'REVERTIDO'
  | 'FALLIDO';

/** Las urls de una versión de la foto, tal cual están en disco. */
export interface Instantanea {
  storageKey: string;
  url: string;
  urlMedium: string | null;
  urlLarge: string;
  urlOriginal: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  checksum: string | null;
}

export interface Retoque {
  id: string;
  propertyImageId: string;
  propertyId: string;
  /** Lo que se pidió, en las palabras de quien lo pidió. */
  instruction: string;
  kind: RetouchKind;
  /** Por qué se clasificó así. Es lo que hace discutible la etiqueta. */
  motivos: string[];
  model: string;
  quality: string;
  /** Llega como cadena: en la base es `numeric` y el driver no lo redondea. */
  costUsd: string;
  /** La foto tal como estaba antes. Es el «antes» del comparador. */
  originalSnapshot: Instantanea;
  /** El candidato. Nulo si falló o si ya se descartó y se limpió. */
  retouchedSnapshot: Instantanea | null;
  status: RetouchStatus;
  requestedByAgentId: string;
  decidedByAgentId: string | null;
  decidedAt: string | null;
  alteracionAsumida: boolean;
  error?: string | null;
  createdAt: string;
}

/**
 * Lo que haría una instrucción, sin hacerla.
 *
 * No llama al modelo y no cuesta nada. Existe para que el aviso llegue MIENTRAS
 * se escribe y no después de cobrar, que es cuando ya da igual.
 */
export interface PrevioRetoque {
  /**
   * El texto ENTERO que se le va a mandar al modelo: la mejora de siempre más
   * lo que se haya escrito.
   *
   * Lo compone el servidor y lo devuelve ya compuesto a propósito. El panel no
   * pega dos cadenas: si lo hiciera habría dos versiones del mismo texto —una
   * aquí y otra en la API— y afinar la de allí dejaría a esta pantalla
   * enseñando la vieja sin que nada fallara.
   */
  instruccion: string;
  /** Solo la base, para poder separar en pantalla lo de siempre de lo de hoy. */
  mejoraPorDefecto: string;
  kind: RetouchKind;
  kindLabel: string;
  motivos: string[];
  advertencia: string | null;
  /** Si hará falta marcar la casilla de «sé lo que estoy haciendo». */
  requiereConfirmacion: boolean;
  costeOrientativoUsd: number | null;
  model: string;
  quality: string;
}

export interface ResumenRetoque {
  intentos: number;
  aplicados: number;
  /** Suma de TODO lo intentado: un descarte también se pagó. */
  costeTotalUsd: string;
  alteranLaRealidad: number;
}

/** Lo que `/image-ai/status` dice del retoque. El resto lo lee `imagenes-ia`. */
export interface EstadoRetoque {
  /** Sin clave del proveedor es `false` y no se ofrece el botón. */
  enabled: boolean;
  /**
   * Lo que cuesta un retoque, ORIENTATIVO, y lo que cuesta un análisis.
   *
   * Van juntos porque separados no dicen nada: «0,25 USD» no le sitúa el gasto
   * a nadie y «unas quinientas veces lo que cuesta analizarla» sí. Y salen los
   * dos del mismo sitio para que el día que se cambie de modelo se muevan a la
   * vez — una comparación en la que solo se actualiza una mitad miente más que
   * no ponerla.
   *
   * Orientativo de verdad: el coste real depende del tamaño de salida (0,182
   * USD a 1584×1056 y 0,245 a 2128×1424). El de cada retoque ya hecho viene en
   * su `costUsd`, calculado con los tokens que devolvió el proveedor.
   *
   * Los nombres viejos siguen leyéndose, y no es por pereza. Este par ya se
   * llamó de dos maneras distintas según el endpoint, y la consecuencia fue
   * justo la peor posible: el campo no se encontraba, la pantalla caía con
   * elegancia al importe a secas y NADA daba error en ningún lado — se perdía
   * en silencio la única cifra que hace que el precio signifique algo. Aceptar
   * los dos nombres cuesta una línea y convierte un renombrado en un no-evento.
   */
  costeOrientativoUsd?: number | null;
  costeAnalisisUsd?: number | null;
  /** Como se llamaron antes las dos de arriba. */
  retoqueUsd?: number | null;
  analisisUsd?: number | null;
  moneda: string;
  kinds: { value: RetouchKind; label: string }[];
}

/** Lo que cuesta un retoque, se llame como se llame en este servidor. */
export function precioRetoque(estado: EstadoRetoque): number | null {
  return estado.costeOrientativoUsd ?? estado.retoqueUsd ?? null;
}

/** Lo que cuesta un análisis, con el que se arma el múltiplo. */
export function precioAnalisis(estado: EstadoRetoque): number | null {
  return estado.costeAnalisisUsd ?? estado.analisisUsd ?? null;
}

export const KIND_TONO: Record<RetouchKind, 'green' | 'amber' | 'red'> = {
  REVELADO: 'green',
  ALTERACION: 'amber',
  OCULTA_DEFECTO: 'red',
};

// --- llamadas ---------------------------------------------------------------

export const retoque = {
  /**
   * Si el retoque con IA esta disponible en este servidor.
   *
   * Se pide aparte y con tipo propio en vez de reutilizar `imagenesIA.estado`,
   * que llama a la misma ruta: aquel tipo no declara `retouch` y ampliarlo
   * significaria tocar `imagenes-ia.ts`, que esta reescribiendo otro agente.
   * Una peticion mas a una ruta que no cuesta nada es mejor que un choque.
   */
  estado: (signal?: AbortSignal) =>
    opcional(
      api.get<{ retouch?: EstadoRetoque }>(`${BASE}/status`, undefined, signal),
    ),

  /**
   * Revelar la foto o quitarle el revelado.
   *
   * Devuelve la imagen con las urls reversionadas, así que el navegador recarga
   * la miniatura solo: no hace falta inventarse un parámetro anticaché.
   */
  revelar: (propertyId: string, imageId: string, aplicar: boolean) =>
    api.patch<MediaImage>(`/properties/${propertyId}/images/${imageId}/develop`, {
      aplicar,
    }),

  propuesta: (propertyId: string, signal?: AbortSignal) =>
    opcional(
      api.get<RevisionPropuesta>(
        `${BASE}/propuesta/properties/${propertyId}`,
        undefined,
        signal,
      ),
    ),

  /**
   * Analizar y devolver la propuesta.
   *
   * Esto SI llama al modelo: unos 0,00074 USD por foto y 15-25 s por tanda de
   * doce. Es barato, pero no gratis, y por eso lo dispara un boton y no la
   * carga de la pantalla.
   */
  proponer: (propertyId: string, opciones: { imageIds?: string[]; force?: boolean }) =>
    api.post<RevisionPropuesta>(`${BASE}/propuesta/properties/${propertyId}`, opciones),

  /**
   * Aplicar unos cortes concretos.
   *
   * Se mandan las porciones en el cuerpo y no se dejan al servidor porque lo
   * que se aplica no siempre es lo que se propuso: la persona puede aceptar
   * unos cortes y descartar otros después de ver cómo queda.
   *
   * Esta ruta todavía no existe en la API. Está escrita contra el contrato
   * pedido y devuelve 404 hasta que exista; quien la llama ya sabe leer ese
   * 404 como «este servidor aún no», no como un fallo de quien pulsó.
   */
  recortar: (imageId: string, cortes: { borde: Borde; porcion: number }[]) =>
    api.post<MediaImage>(`${BASE}/images/${imageId}/crop`, { cortes }),

  /**
   * Gratis: clasifica el texto sin llamar al modelo.
   *
   * `api.post` no acepta señal de cancelacion, asi que quien la llama mientras
   * se escribe tiene que descartar la respuesta que llegue tarde. Es lo que
   * hace `FichaFoto`: sin eso, teclear rapido deja ganar a veces la
   * clasificacion de una frase anterior, y el aviso de «esto altera la
   * realidad» acabaria hablando de un texto que ya no esta.
   */
  /**
   * Deshacer el recorte: la lista vacía devuelve la foto entera.
   *
   * No hace falta otra ruta y no es un truco: el recorte se guarda como caja y
   * se regenera desde el negativo, así que recortar dos veces no acumula y
   * deshacer devuelve la foto completa.
   */
  deshacerRecorte: (imageId: string) =>
    api.post<MediaImage>(`${BASE}/images/${imageId}/crop`, { cortes: [] }),

  /*
    Sin texto también: es la llamada que se hace nada más abrir la foto.

    La mejora por defecto se aplica siempre, así que «¿qué va a pasar si no
    escribo nada?» tiene respuesta —y coste— antes de tocar el botón. Antes
    esto exigía tres caracteres y por eso el caso más frecuente era el único
    que se lanzaba sin ver nada.
  */
  previoRetoque: (instruction?: string) =>
    api.post<PrevioRetoque>(
      `${BASE}/retouch/preview`,
      instruction ? { instruction } : {},
    ),

  /** Todos los intentos de una foto, incluidos los descartados y los fallidos. */
  retoquesDe: (imageId: string, signal?: AbortSignal) =>
    opcional(api.get<Retoque[]>(`${BASE}/images/${imageId}/retouches`, undefined, signal)),

  /** Aquí se gasta. El coste va delante del botón que llama a esto. */
  retocar: (imageId: string, instruction: string, alteracionAsumida: boolean) =>
    api.post<Retoque>(`${BASE}/images/${imageId}/retouch`, {
      /*
        Lo que viaja es EL COMENTARIO, no la petición entera: la mejora de
        siempre la pone el servidor. Vacío es un caso legítimo y frecuente
        —«mejórala y ya»— y por eso el campo se omite en vez de mandarse en
        blanco, que es lo que el DTO acepta como «sin comentario».
      */
      ...(instruction ? { instruction } : {}),
      alteracionAsumida,
    }),

  /** La segunda decisión: esto es lo que publica el resultado. */
  aplicar: (retoqueId: string) =>
    api.post<Retoque>(`${BASE}/retouches/${retoqueId}/apply`),

  descartar: (retoqueId: string) =>
    api.post<Retoque>(`${BASE}/retouches/${retoqueId}/discard`),

  /** La marcha atrás de un retoque ya publicado. No cuesta nada. */
  revertir: (retoqueId: string) =>
    api.post<Retoque>(`${BASE}/retouches/${retoqueId}/revert`),

  resumen: (propertyId: string, signal?: AbortSignal) =>
    opcional(
      api.get<ResumenRetoque>(
        `${BASE}/properties/${propertyId}/retouch-summary`,
        undefined,
        signal,
      ),
    ),
};

// --- lo que la pantalla necesita saber decir --------------------------------

/**
 * Un importe en dólares, con coma decimal.
 *
 * En español el separador decimal es la coma, y `toFixed` da un punto. Con
 * «0.18» delante, un asesor colombiano lee dieciocho, no dieciocho centésimas.
 */
export function dolares(valor: number | string): string {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(numero)) return '—';
  return `${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero)} USD`;
}

/**
 * El coste, en palabras que signifiquen algo.
 *
 * Una cifra sola no se sabe si es cara. El múltiplo sí: el análisis es lo que
 * el asesor lanza todos los días, así que es la única escala que ya tiene
 * calibrada. Si no se sabe lo que cuesta un análisis, no se inventa.
 */
export function costeEnPalabras(
  estado: EstadoRetoque,
  /** El precio de esta llamada concreta, si la previsualización lo dijo. */
  precio: number | null = null,
): string {
  const retoque = precio ?? precioRetoque(estado);
  if (retoque === null) return 'coste desconocido';
  const cifra = `${dolares(retoque)} orientativos`;
  const analisis = precioAnalisis(estado);
  if (!analisis || analisis <= 0) return cifra;
  const veces = Math.round(retoque / analisis);
  if (veces < 2) return cifra;
  return `${cifra} · unas ${veces} veces lo que cuesta analizarla`;
}

/** «1,50:1» a partir del número. Es lo que hace discutible un «muy apaisada». */
export function aspectoEnPalabras(aspecto: number): string {
  return `${aspecto.toFixed(2).replace('.', ',')}:1`;
}
