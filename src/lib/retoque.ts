import { ApiError, api } from './api';

/**
 * Lo que se le hace a una foto después de subirla, visto desde el panel.
 *
 * Son tres cosas distintas que la pantalla junta y que conviene no confundir:
 *
 * - El **revelado** es código: exposición, enderezado, recorte. No inventa
 *   nada, no cuesta nada y se aplica solo. Lo único que hace falta de él es
 *   poder comprobar que mejoró, y por eso lo que importa aquí son los dos
 *   lados —el antes y el después— y no los parámetros.
 * - La **propuesta** es un diagnóstico: qué le pasa a esta foto. Se parte en
 *   dos porque tiene dos destinatarios: lo que arregla una máquina y lo que
 *   exige que alguien vuelva a la casa con la cámara. Un listado mezclado no
 *   lo puede usar ninguno de los dos.
 * - El **retoque con IA** genera píxeles que no estaban. Cuesta entre 10 y 100
 *   veces el análisis, cambia la foto que ve un comprador, y por eso es lo
 *   único de los tres que no pasa sin que una persona diga que sí dos veces:
 *   una para pagarlo y otra para publicarlo.
 *
 * Vive aparte de `imagenes-ia.ts` —que es el veredicto del modelo sobre la
 * galería— porque el vocabulario no se solapa: allí se habla de estancias,
 * portadas y privacidad; aquí de exposición, coste y marcha atrás. Y como
 * `imagenes-ia.ts`, es la única capa que conoce los nombres del servidor.
 *
 * Los tres módulos de la API se están escribiendo en paralelo a esta pantalla.
 * De ahí `opcional()`: un 404 no es un fallo, es «este servidor todavía no
 * tiene esa parte», y la respuesta correcta es no pintar ese bloque en vez de
 * teñir de rojo una ficha de inmueble que por lo demás funciona.
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

// --- el revelado automático -------------------------------------------------

/**
 * En qué punto está el revelado de una foto.
 *
 * `OMITIDO` no es un fallo y por eso no comparte cubo con `FALLIDO`: es «esta
 * foto no necesitaba nada» o «tocarla la habría empeorado», y merece leerse
 * distinto de «se intentó y salió mal».
 */
export type EstadoRevelado = 'PENDIENTE' | 'HECHO' | 'FALLIDO' | 'OMITIDO';

/** Un ajuste del revelado, ya redactado por el servidor. */
export interface AjusteRevelado {
  clave: string;
  /** Cómo se llama en español: «Exposición», «Enderezado». */
  etiqueta: string;
  /** Ya formateado: «+0,4 EV», «1,8°». El panel no calcula unidades. */
  valor: string;
}

export interface ReveladoImagen {
  propertyImageId: string;
  estado: EstadoRevelado;
  /** Por qué se omitió o por qué falló, en español. */
  motivo: string | null;
  /**
   * Los cuatro tamaños, y los cuatro hacen falta.
   *
   * El «antes» necesita miniatura propia igual que el «después»: en el
   * comparador es media pantalla, no una nota al pie. Y la rejilla pinta
   * SIEMPRE los `thumb`: con 6.306 imágenes reales, pedir los de 1600 px para
   * enseñar sellos de correos es lo que tumba la ficha.
   */
  thumbAntes: string;
  thumbDespues: string;
  urlAntes: string;
  urlDespues: string;
  ajustes: AjusteRevelado[];
  createdAt: string;
}

export interface RevisionRevelado {
  images: ReveladoImagen[];
}

export interface EstadoModuloRevelado {
  enabled: boolean;
  /** Si se aplica solo al subir. Cambia el texto: «se hizo» o «se puede hacer». */
  auto: boolean;
}

// --- la propuesta -----------------------------------------------------------

/**
 * A quién va dirigida una sugerencia. Es el campo que parte la pantalla en dos.
 *
 * Lo decide el servidor y no un diccionario de aquí, y eso es deliberado: si el
 * panel dedujera el destino a partir del código, el día que la API añada un
 * código nuevo caería en el cubo equivocado sin dar error — y el cubo
 * equivocado aquí significa o bien prometer que un botón arregla algo que
 * necesita una cámara, o bien mandar a alguien a cruzar Bucaramanga por algo
 * que se resolvía con un recorte.
 */
export type DestinoSugerencia = 'AUTO' | 'REVISITA';

export type SeveridadSugerencia = 'ALTA' | 'MEDIA' | 'BAJA';

export interface Sugerencia {
  id: string;
  destino: DestinoSugerencia;
  /** Familia del problema. Solo se usa para el icono: uno desconocido no rompe. */
  codigo: string;
  /** Una línea en español. Es lo que se lee. */
  titulo: string;
  detalle: string | null;
  severidad: SeveridadSugerencia;
}

/** Lo medido, no lo opinado. Va al lado de la frase para que se pueda discutir. */
export interface MetricasImagen {
  anchura: number;
  altura: number;
  /** Ancho partido por alto. 1,33 es un 4:3; 2,3 es una franja. */
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
  generatedAt: string | null;
}

// --- el retoque con IA ------------------------------------------------------

/**
 * El ciclo de un retoque.
 *
 * `LISTO` es el estado que justifica que esto exista: el resultado está hecho y
 * pagado, pero NO publicado. Sin ese paso intermedio, pulsar un botón cambiaría
 * la foto que ve un comprador sin que nadie la haya mirado.
 */
export type EstadoRetoque =
  | 'PROCESANDO'
  | 'LISTO'
  | 'ACEPTADO'
  | 'DESCARTADO'
  | 'FALLIDO';

export interface Retoque {
  id: string;
  propertyImageId: string;
  estado: EstadoRetoque;
  motivo: string | null;
  thumbResultado: string | null;
  urlResultado: string | null;
  /** Lo que costó de verdad esta llamada, no la estimación. */
  coste: number | null;
  moneda: string;
  createdAt: string;
}

export interface EstadoModuloRetoque {
  /** Sin clave del proveedor esto es `false` y no se ofrece el botón. */
  enabled: boolean;
  /** Lo que cuesta un retoque. Se pinta ANTES de pulsar, no después. */
  coste: number;
  moneda: string;
  /**
   * Lo que cuesta analizar una foto.
   *
   * Está aquí porque una cifra suelta no le dice nada a un asesor: «0,04 USD»
   * no se sabe si es caro. «Cuesta 40 veces lo que analizarla» sí. Si el
   * servidor no lo manda, la comparación no se enseña — nunca se inventa.
   */
  costeAnalisis: number | null;
}

// --- llamadas ---------------------------------------------------------------

export const retoque = {
  /** `null` = este servidor no revela. No es un error. */
  estadoRevelado: (signal?: AbortSignal) =>
    opcional(api.get<EstadoModuloRevelado>(`${BASE}/revelado/status`, undefined, signal)),

  revelado: (propertyId: string, signal?: AbortSignal) =>
    opcional(
      api.get<RevisionRevelado>(
        `${BASE}/revelado/properties/${propertyId}`,
        undefined,
        signal,
      ),
    ),

  /** Rehacer el revelado. No llama a ningún modelo: es sharp, y no se cobra. */
  revelar: (propertyId: string, opciones: { imageIds?: string[]; force?: boolean }) =>
    api.post<RevisionRevelado>(`${BASE}/revelado/properties/${propertyId}`, opciones),

  /** Deshacer el revelado de una foto: se publica el original tal cual llegó. */
  descartarRevelado: (imageId: string) =>
    api.delete<unknown>(`${BASE}/revelado/images/${imageId}`),

  propuesta: (propertyId: string, signal?: AbortSignal) =>
    opcional(
      api.get<RevisionPropuesta>(
        `${BASE}/propuesta/properties/${propertyId}`,
        undefined,
        signal,
      ),
    ),

  /** Esto sí mira las fotos y cuesta, aunque mucho menos que retocarlas. */
  proponer: (propertyId: string, opciones: { imageIds?: string[]; force?: boolean }) =>
    api.post<RevisionPropuesta>(`${BASE}/propuesta/properties/${propertyId}`, opciones),

  estadoRetoque: (signal?: AbortSignal) =>
    opcional(api.get<EstadoModuloRetoque>(`${BASE}/retoque/status`, undefined, signal)),

  /** Lo que hay hecho o a medias de una foto. `null` también si nunca se retocó. */
  retoqueDe: (imageId: string, signal?: AbortSignal) =>
    opcional(api.get<Retoque>(`${BASE}/retoque/images/${imageId}`, undefined, signal)),

  /** Aquí se gasta. El coste va delante del botón que llama a esto. */
  retocar: (imageId: string, sugerenciaIds?: string[]) =>
    api.post<Retoque>(`${BASE}/retoque/images/${imageId}`, { sugerenciaIds }),

  /** La segunda decisión: esto es lo que publica el resultado. */
  aceptar: (retoqueId: string) =>
    api.post<Retoque>(`${BASE}/retoque/${retoqueId}/accept`),

  descartar: (retoqueId: string) =>
    api.post<Retoque>(`${BASE}/retoque/${retoqueId}/discard`),

  /** La marcha atrás, también después de aceptar. */
  volverAlOriginal: (imageId: string) =>
    api.delete<unknown>(`${BASE}/retoque/images/${imageId}`),
};

// --- lo que la pantalla necesita saber decir --------------------------------

/**
 * El coste, en palabras que signifiquen algo.
 *
 * Una cifra sola no se sabe si es cara. El múltiplo sí: es la comparación que
 * el asesor ya tiene calibrada, porque el análisis lo lanza todos los días.
 */
export function costeEnPalabras(estado: EstadoModuloRetoque): string {
  if (!estado.costeAnalisis || estado.costeAnalisis <= 0) return importe(estado);
  const veces = Math.round(estado.coste / estado.costeAnalisis);
  if (veces < 2) return importe(estado);
  return `${importe(estado)} · unas ${veces} veces lo que cuesta analizarla`;
}

/**
 * La cifra sola, con coma decimal.
 *
 * En español el separador decimal es la coma, y `toFixed` da un punto. Con
 * «0.42» delante, un asesor colombiano lee cuarenta y dos —no cuarenta y dos
 * centésimas—, que es justo el malentendido que no puede tener el número que
 * decide si se gasta o no.
 */
export function importe(estado: EstadoModuloRetoque): string {
  const cifra = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(estado.coste);
  return `${cifra} ${estado.moneda}`;
}

/** «2,33:1» a partir del número. Es lo que hace discutible un «muy apaisada». */
export function aspectoEnPalabras(aspecto: number): string {
  return `${aspecto.toFixed(2).replace('.', ',')}:1`;
}
