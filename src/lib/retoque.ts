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

// --- el encuadre: qué recortar y qué no tiene arreglo -----------------------

/** Los cuatro bordes, como los nombra el servidor. */
export type Borde = 'ARRIBA' | 'ABAJO' | 'IZQUIERDA' | 'DERECHA';

/**
 * A quién le toca arreglar esta foto. Es el campo que parte la pantalla en dos.
 *
 * Lo decide el servidor y no un diccionario de aquí. Deducirlo del texto haría
 * que un caso nuevo cayera en el cubo equivocado sin dar error, y el cubo
 * equivocado es o prometer que un botón arregla lo que necesita una cámara, o
 * mandar a alguien a cruzar Bucaramanga por un recorte.
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
  const de = (borde: Borde) =>
    cortes.find((c) => c.borde === borde)?.porcion ?? 0;
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
 * El revelado en palabras, ya redactado aquí porque el servidor manda números.
 *
 * Devuelve lista vacía cuando no se tocó nada, que es distinto de no haberla
 * revelado: eso lo distingue quien llama, mirando `developedAt`.
 */
export function reveladoEnPalabras(revelado: Revelado | null): string[] {
  if (!revelado) return [];
  const dichos: string[] = [];
  if (revelado.niveles) {
    /* La ganancia del estirado de niveles. 1,0 es «no se tocó». */
    const porcentaje = Math.round((revelado.niveles.g - 1) * 100);
    if (porcentaje !== 0) dichos.push(`Contraste ${porcentaje > 0 ? '+' : ''}${porcentaje}%`);
  }
  if (revelado.balance) {
    const { r, b } = revelado.balance;
    /* Más rojo que azul es calentar; al revés, enfriar. Es la lectura que
       tiene un fotógrafo, y el número crudo no se la da a nadie. */
    if (Math.abs(r - b) > 0.02) dichos.push(r > b ? 'Balance más cálido' : 'Balance más frío');
  }
  if (revelado.gamma && revelado.gamma !== 1) {
    dichos.push(revelado.gamma > 1 ? 'Sombras levantadas' : 'Medios bajados');
  }
  return dichos;
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
  enabled: boolean;
  kinds: { value: RetouchKind; label: string }[];
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
  previoRetoque: (instruction: string) =>
    api.post<PrevioRetoque>(`${BASE}/retouch/preview`, { instruction }),

  /** Todos los intentos de una foto, incluidos los descartados y los fallidos. */
  retoquesDe: (imageId: string, signal?: AbortSignal) =>
    opcional(api.get<Retoque[]>(`${BASE}/images/${imageId}/retouches`, undefined, signal)),

  /** Aquí se gasta. El coste va delante del botón que llama a esto. */
  retocar: (imageId: string, instruction: string, alteracionAsumida: boolean) =>
    api.post<Retoque>(`${BASE}/images/${imageId}/retouch`, {
      instruction,
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
  costeUsd: number | null,
  costeAnalisisUsd: number | null,
): string {
  if (costeUsd === null) return 'coste desconocido';
  const cifra = dolares(costeUsd);
  if (!costeAnalisisUsd || costeAnalisisUsd <= 0) return cifra;
  const veces = Math.round(costeUsd / costeAnalisisUsd);
  if (veces < 2) return cifra;
  return `${cifra} · unas ${veces} veces lo que cuesta analizarla`;
}
