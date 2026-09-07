import { api } from './api';
import type { Property } from './api';

/**
 * La revisión de fotos con IA, vista desde el panel.
 *
 * Vive aparte de `api.ts` —que es el contrato del inventario, ya de mil
 * líneas— porque es un módulo entero con su propio vocabulario: veredictos,
 * versiones de prompt y umbrales de la puerta no le hacen falta a ninguna otra
 * pantalla. Y porque es la única capa que toca los nombres del servidor: si
 * mañana la API renombra un campo, se cambia aquí y no en tres pantallas.
 *
 * Regla que atraviesa todo el módulo, y que es el encargo: la IA no la dispara
 * nunca el cliente. Ninguna de estas rutas es pública; el propietario que manda
 * una consignación pasa por la puerta de código —que no cuesta nada— y ahí
 * acaba su recorrido.
 */

const BASE = '/image-ai';

// --- lo que la IA dice de una foto -----------------------------------------

/**
 * La estancia. Es un enum cerrado en el servidor, pero aquí se trata como
 * texto: una etiqueta nueva se pinta tal cual en vez de romper la pantalla, y
 * el nombre en español lo manda `status`, que es quien lo sabe.
 */
export type RoomKind = string;

/** Caras, placas, papeles y pantallas: lo que no puede salir a la web. */
export interface PrivacyFlags {
  faces: boolean;
  plates: boolean;
  documents: boolean;
  screens: boolean;
  /** La nomenclatura de la fachada o el rótulo del portal. */
  address?: boolean;
  notes: string | null;
}

/** El juicio del modelo sobre UNA foto, tal cual lo guardó el servidor. */
export interface AnalisisImagen {
  id: string;
  propertyImageId: string;
  propertyId: string;
  room: RoomKind;
  /** Cuánto se fía el modelo de la estancia, 0-1. */
  roomConfidence: number;
  /** Calidad fotográfica, 0-100. */
  quality: number;
  /** Aptitud para ser la portada, 0-100. Es otra pregunta que `quality`. */
  coverScore: number;
  caption: string | null;
  /** Qué está mal, ya redactado en español por el modelo. */
  issues: string[];
  /** Qué debería hacer el asesor. */
  fixes: string[];
  privacy: PrivacyFlags;
  usable: boolean;
  promptVersion: number;
  model: string;
  batchId: string | null;
  createdAt: string;
}

/** El juicio sobre la galería entera: orden, portada y lo que falta. */
export interface AnalisisAlbum {
  id: string;
  propertyId: string;
  batchId: string;
  /** Ids de `property_image`, en el orden que propone. */
  suggestedOrder: string[];
  coverImageId: string | null;
  missing: RoomKind[];
  summary: string | null;
  promptVersion: number;
  model: string;
  createdAt: string;
}

export interface RevisionInmueble {
  images: AnalisisImagen[];
  album: AnalisisAlbum | null;
  /** La versión del prompt que se usaría si se analizara ahora. */
  promptVersion: number;
  model: string;
  /**
   * Lo guardado se hizo con otro prompt u otro modelo. No es que esté mal: es
   * que repetirlo daría otra cosa, y repetirlo se paga.
   */
  stale: boolean;
}

export interface ResultadoAnalisis {
  batchId: string;
  analyzed: AnalisisImagen[];
  /** Fotos que ya estaban analizadas con este prompt y no se volvieron a pagar. */
  skipped: number;
  album: AnalisisAlbum | null;
  usage: { inputTokens: number; outputTokens: number } | null;
}

/**
 * Si el módulo está vivo y con qué vocabulario habla.
 *
 * Las etiquetas de estancia salen de aquí y no de un diccionario del panel: son
 * del servidor, que es quien las usa también en el prompt. Duplicarlas aquí
 * sería garantizar que un día digan cosas distintas.
 */
export interface EstadoImagenesIA {
  /** Sin clave del proveedor esto es `false` y no hay que ofrecer el botón. */
  enabled: boolean;
  /**
   * Cuántas fotos entran en una llamada.
   *
   * Viene del servidor y no de una constante de aquí porque es configurable
   * (`IMAGE_AI_MAX_IMAGES`, de 1 a 40): el día que se baje para contener el
   * gasto, un número copiado en el panel prometería más de lo que se manda, y
   * eso no da error — se descubre en la factura.
   */
  maxImages: number;
  promptVersion: number;
  rooms: { value: RoomKind; label: string }[];
  gateCodes: string[];
  severities: string[];
}

// --- el prompt --------------------------------------------------------------

export interface VersionPrompt {
  id: string;
  version: number;
  body: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

export interface PromptActivo {
  active: VersionPrompt;
  /** El texto que viaja con el código: el punto de partida y la marcha atrás. */
  repositoryDefault: string;
}

/** El tope del servidor. Por encima, el modelo deja de leerlo entero. */
export const PROMPT_MAX = 20_000;
/** Por debajo de esto el servidor lo rechaza: es "lo he borrado sin querer". */
export const PROMPT_MIN = 50;

// --- la puerta de código ----------------------------------------------------

/**
 * Los umbrales que se le exigen a una foto ANTES de gastar nada en IA. Se
 * miden con código, no con el modelo, y por eso son números y no opiniones.
 */
export interface UmbralesPuerta {
  minWidth: number;
  minHeight: number;
  recommendedWidth: number;
  minAspectRatio: number;
  maxAspectRatio: number;
  aspectBlocks: boolean;
  maxFileMb: number;
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  maxDarkFraction: number;
  maxBrightFraction: number;
  nearDuplicateDistance: number;
}

/** `INVENTORY` es lo que sube el equipo; `REQUEST`, lo que manda un propietario. */
export type PerfilPuerta = 'INVENTORY' | 'REQUEST';

export interface PerfilDescrito {
  profile: PerfilPuerta;
  /** Lo que trae el repositorio. */
  defaults: UmbralesPuerta;
  /** Lo que se aplica ahora, con lo tocado por la agencia encima. */
  effective: UmbralesPuerta;
  /** Qué umbrales están tocados: lo demás sigue el valor de fábrica. */
  overridden: string[];
  updatedAt: string | null;
}

export const PERFIL_LABEL: Record<PerfilPuerta, string> = {
  INVENTORY: 'Lo que sube el equipo',
  REQUEST: 'Lo que manda un propietario',
};

/**
 * Cómo se llama y qué significa cada umbral.
 *
 * El nombre técnico no le dice nada a quien lo va a mover: `minSharpness` es
 * "movida" y `maxBrightFraction` es "quemada". La explicación va al lado del
 * campo porque es lo que permite decidir sin preguntar.
 */
export const UMBRAL_TEXTO: Record<
  keyof UmbralesPuerta,
  { label: string; ayuda: string; paso?: number }
> = {
  minWidth: {
    label: 'Ancho mínimo (px)',
    ayuda: 'Por debajo, la foto no entra.',
  },
  minHeight: { label: 'Alto mínimo (px)', ayuda: 'El suelo del lado corto.' },
  recommendedWidth: {
    label: 'Ancho recomendado (px)',
    ayuda: 'Entra, pero avisa: la ficha se sirve a 1600 px y por debajo se estira.',
  },
  minAspectRatio: {
    label: 'Proporción mínima',
    ayuda: 'Por encima de 1 obliga a horizontal. 1,20 es como se escribe «apaisada».',
    paso: 0.05,
  },
  maxAspectRatio: {
    label: 'Proporción máxima',
    ayuda: 'Corta las panorámicas de tira, que en la ficha salen como una franja.',
    paso: 0.05,
  },
  aspectBlocks: {
    label: 'La proporción bloquea',
    ayuda: 'Si se apaga, una foto vertical entra con aviso en vez de rechazarse.',
  },
  maxFileMb: { label: 'Peso máximo (MB)', ayuda: 'Por fichero.', paso: 0.5 },
  minSharpness: {
    label: 'Nitidez mínima',
    ayuda: 'Por debajo se marca como movida. Avisa, no bloquea: una pared lisa también puntúa bajo.',
  },
  minBrightness: {
    label: 'Luz mínima',
    ayuda: '0 a 255. Por debajo, oscura.',
  },
  maxBrightness: {
    label: 'Luz máxima',
    ayuda: '0 a 255. Por encima, lavada.',
  },
  maxDarkFraction: {
    label: 'Negros máximos',
    ayuda: 'Fracción de la foto aplastada a negro, de 0 a 1.',
    paso: 0.05,
  },
  maxBrightFraction: {
    label: 'Blancos máximos',
    ayuda: 'Fracción quemada, de 0 a 1. Es lo que caza el «sin imagen» blanco.',
    paso: 0.05,
  },
  nearDuplicateDistance: {
    label: 'Distancia de casi-duplicado',
    ayuda: 'Por debajo, dos fotos se consideran el mismo encuadre. 0 es idéntico.',
  },
};

/** El orden en el que se pintan: primero lo que se toca, luego el ajuste fino. */
export const UMBRALES_ORDEN: (keyof UmbralesPuerta)[] = [
  'minWidth',
  'minHeight',
  'recommendedWidth',
  'maxFileMb',
  'minAspectRatio',
  'maxAspectRatio',
  'aspectBlocks',
  'minSharpness',
  'minBrightness',
  'maxBrightness',
  'maxDarkFraction',
  'maxBrightFraction',
  'nearDuplicateDistance',
];

// --- llamadas ---------------------------------------------------------------

export const imagenesIA = {
  estado: (signal?: AbortSignal) =>
    api.get<EstadoImagenesIA>(`${BASE}/status`, undefined, signal),

  /** Lo que hay guardado de un inmueble. No llama al modelo ni cuesta nada. */
  revision: (propertyId: string, signal?: AbortSignal) =>
    api.get<RevisionInmueble>(`${BASE}/properties/${propertyId}`, undefined, signal),

  /** Esto SÍ llama al modelo y se paga por imagen. */
  analizar: (propertyId: string, opciones: { imageIds?: string[]; force?: boolean }) =>
    api.post<ResultadoAnalisis>(`${BASE}/properties/${propertyId}/analyze`, opciones),

  prompt: (signal?: AbortSignal) =>
    api.get<PromptActivo>(`${BASE}/prompt`, undefined, signal),

  historialPrompt: (signal?: AbortSignal) =>
    api.get<VersionPrompt[]>(`${BASE}/prompt/history`, undefined, signal),

  /** Guarda una versión nueva y la deja activa. No sobrescribe la anterior. */
  guardarPrompt: (body: string, notes?: string) =>
    api.post<VersionPrompt>(`${BASE}/prompt`, { body, notes }),

  /** Vuelve a una versión anterior: la activa, no la copia. */
  activarPrompt: (version: number) =>
    api.put<VersionPrompt>(`${BASE}/prompt/${version}/activate`),

  restaurarPromptDeFabrica: () =>
    api.post<VersionPrompt>(`${BASE}/prompt/restore-default`),

  puerta: (signal?: AbortSignal) =>
    api.get<PerfilDescrito[]>(`${BASE}/gate`, undefined, signal),

  /** Un umbral en `null` vuelve al valor del repositorio. */
  guardarPuerta: (
    profile: PerfilPuerta,
    rules: Record<string, number | boolean | null>,
  ) => api.put<UmbralesPuerta>(`${BASE}/gate/${profile}`, { rules }),

  reiniciarPuerta: (profile: PerfilPuerta) =>
    api.delete<UmbralesPuerta>(`${BASE}/gate/${profile}`),

  muestras: (signal?: AbortSignal) =>
    api.get<Property[]>(`${BASE}/samples`, undefined, signal),

  crearMuestras: (count: number) =>
    api.post<Property[]>(`${BASE}/samples`, { count }),

  borrarMuestras: () => api.delete<unknown>(`${BASE}/samples`),

  /**
   * Aceptar el orden que propuso la IA.
   *
   * No hay ruta en `image-ai` para esto y está bien que no la haya: cambiar el
   * orden de la galería es del inventario, no del análisis. La IA propone y
   * esta llamada es la persona diciendo que sí.
   */
  aplicarOrden: (propertyId: string, imageIds: string[]) =>
    api.put<unknown>(`/properties/${propertyId}/images/order`, { imageIds }),
};
