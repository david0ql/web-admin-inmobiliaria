import { api } from './api';

/**
 * La revisión de fotos con IA, vista desde el panel.
 *
 * Vive aparte de `api.ts` —que es el contrato del inventario, ya de mil
 * líneas— porque es un módulo entero con su propio vocabulario: veredictos,
 * versiones de prompt y reglas técnicas no le hacen falta a ninguna otra
 * pantalla. Y porque es la única capa que toca los nombres del servidor: si
 * mañana la API renombra un campo, se cambia aquí y no en tres pantallas.
 *
 * Regla que atraviesa todo el módulo: la IA no la dispara nunca el cliente.
 * Todas estas rutas exigen sesión del equipo; el propietario que manda una
 * consignación pasa por la puerta técnica y nada más.
 */

const BASE = '/image-review';

// --- lo que la IA dice de una foto -----------------------------------------

/**
 * Para qué sirve la foto. Los valores los fija el prompt; el panel solo tiene
 * que saber escribirlos en español y no romperse si aparece uno nuevo — de ahí
 * que `role` sea `string` y no una unión cerrada: una etiqueta desconocida se
 * enseña tal cual, que es mejor que no enseñar nada.
 */
export type RolImagen = string;

export const ROL_LABEL: Record<string, string> = {
  FACADE: 'Fachada',
  LIVING: 'Sala',
  DINING: 'Comedor',
  KITCHEN: 'Cocina',
  BEDROOM: 'Habitación',
  BATHROOM: 'Baño',
  BALCONY: 'Balcón',
  TERRACE: 'Terraza',
  STUDY: 'Estudio',
  LAUNDRY: 'Zona de ropas',
  GARAGE: 'Parqueadero',
  COMMON_AREA: 'Zona común',
  VIEW: 'Vista',
  FLOOR_PLAN: 'Plano',
  EXTERIOR: 'Exterior',
  DETAIL: 'Detalle',
  OTHER: 'Otro',
};

export function rolLabel(role: RolImagen, fallback?: string | null): string {
  return ROL_LABEL[role] ?? fallback ?? role;
}

/** Cuánto pesa un problema. `BLOCK` es el que no debería publicarse. */
export type Severidad = 'INFO' | 'WARN' | 'BLOCK';

export interface ProblemaImagen {
  code: string;
  /** Ya redactado por el servidor, en español: se pinta tal cual. */
  label: string;
  severity: Severidad;
}

export interface VeredictoImagen {
  imageId: string;
  url: string;
  role: RolImagen;
  /** Cómo lo llama la API; si no viene, el panel traduce `role`. */
  roleLabel: string | null;
  /** 0 a 100. La IA puntúa; la persona decide. */
  quality: number;
  /** Posición que propone la IA, 1 es la primera. */
  suggestedPosition: number;
  isSuggestedCover: boolean;
  issues: ProblemaImagen[];
  note: string | null;
}

export interface EjecucionAnalisis {
  id: string;
  createdAt: string;
  promptVersion: number;
  promptLabel: string | null;
  model: string;
  imageCount: number;
  actorName: string | null;
}

export interface AnalisisImagenes {
  propertyId: string;
  /** Cuántas fotos tiene el inmueble ahora mismo. */
  imageCount: number;
  /** De ésas, cuántas cubre el análisis guardado. */
  analyzedCount: number;
  lastRun: EjecucionAnalisis | null;
  items: VeredictoImagen[];
}

// --- el prompt --------------------------------------------------------------

export interface PromptImagenes {
  /**
   * El armazón: lo que fija el formato de la respuesta. No se edita desde el
   * panel — si se rompe, el servidor deja de entender lo que devuelve el
   * modelo. Se enseña para que se vea qué hay debajo, en solo lectura.
   */
  frame: string;
  /** Lo que la agencia sí escribe: sus criterios. */
  rules: string;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Marcadores que el servidor sustituye antes de llamar al modelo. */
  placeholders: string[];
  /** Tope de caracteres que acepta el servidor en `rules`. */
  maxLength: number;
}

export interface VersionPrompt {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
  authorName: string | null;
  isCurrent: boolean;
  rules: string;
}

// --- las reglas técnicas ----------------------------------------------------

/**
 * La puerta de antes de la IA: lo que se le exige a un fichero para entrar,
 * lo pase quien lo pase — el equipo desde el panel o el propietario desde la
 * web. Se comprueba en el servidor; aquí solo se lee y se ajusta.
 */
export interface ReglasTecnicas {
  minWidth: number;
  minHeight: number;
  maxBytes: number;
  requireLandscape: boolean;
  allowedFormats: string[];
  /** Mínimo de fotos para poder publicar. */
  minImages: number;
}

// --- llamadas ---------------------------------------------------------------

export const imagenesIA = {
  /** Lo que hay guardado de un inmueble, sin gastar una llamada al modelo. */
  revision: (propertyId: string, signal?: AbortSignal) =>
    api.get<AnalisisImagenes>(`${BASE}/properties/${propertyId}`, undefined, signal),

  /** Dispara el análisis. Cuesta dinero: solo se llama desde un botón. */
  analizar: (propertyId: string, imageIds?: string[]) =>
    api.post<AnalisisImagenes>(`${BASE}/properties/${propertyId}/analyze`, {
      imageIds,
    }),

  /** Acepta el orden que propuso la IA, en un gesto. */
  aplicarOrden: (propertyId: string, imageIds: string[]) =>
    api.post<AnalisisImagenes>(`${BASE}/properties/${propertyId}/apply-order`, {
      imageIds,
    }),

  prompt: (signal?: AbortSignal) =>
    api.get<PromptImagenes>(`${BASE}/prompt`, undefined, signal),

  guardarPrompt: (rules: string, label?: string) =>
    api.put<PromptImagenes>(`${BASE}/prompt`, { rules, label }),

  versiones: (signal?: AbortSignal) =>
    api.get<VersionPrompt[]>(`${BASE}/prompt/versions`, undefined, signal),

  restaurar: (versionId: string) =>
    api.post<PromptImagenes>(`${BASE}/prompt/versions/${versionId}/restore`),

  /** Prueba el prompt sin guardarlo: afinar a ciegas no es afinar. */
  probar: (rules: string, imageIds: string[]) =>
    api.post<{ items: VeredictoImagen[]; model: string }>(`${BASE}/prompt/preview`, {
      rules,
      imageIds,
    }),

  reglas: (signal?: AbortSignal) =>
    api.get<ReglasTecnicas>(`${BASE}/settings`, undefined, signal),

  guardarReglas: (reglas: ReglasTecnicas) =>
    api.put<ReglasTecnicas>(`${BASE}/settings`, reglas),
};
