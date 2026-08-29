/**
 * Formatos locales. Todo el inventario esta en pesos colombianos y en metros
 * cuadrados, asi que las funciones asumen ese contexto en lugar de arrastrar
 * una moneda por cada llamada.
 */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const PLAIN = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return COP.format(n);
}

/** Version corta para tarjetas y ejes: 430 M, 1.250 M. */
export function moneyShort(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)} MM`;
  if (n >= 1_000_000) return `$${PLAIN.format(Math.round(n / 1_000_000))} M`;
  if (n >= 1_000) return `$${PLAIN.format(Math.round(n / 1_000))} K`;
  return `$${PLAIN.format(n)}`;
}

export function number(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return PLAIN.format(n);
}

export function area(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${PLAIN.format(value)} m²`;
}

const DATE = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATETIME = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const TIME = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
});

export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return DATE.format(new Date(value));
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return DATETIME.format(new Date(value));
}

export function time(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return TIME.format(new Date(value));
}

/** "hace 3 días", "en 2 horas". Es lo que se quiere leer en una bitacora. */
export function relative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < hour) return rtf.format(Math.round(diff / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day');
  if (abs < 365 * day) return rtf.format(Math.round(diff / (30 * day)), 'month');
  return rtf.format(Math.round(diff / (365 * day)), 'year');
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Fecha en `YYYY-MM-DD`, que es lo que esperan los filtros de la API. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Valor para `<input type="datetime-local">` a partir de un ISO en UTC. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

// --- etiquetas del dominio, en castellano ---------------------------------

export const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponible',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  RENTED: 'Arrendado',
  WITHDRAWN: 'Retirado',
};

/*
 * Los mismos hexes que usa el sitio publico (web-sell/src/lib/format.ts): la
 * paleta de etiquetas de WASI oscurecida hasta pasar AA con texto blanco
 * encima. El ratio de contraste va anotado en cada una. Que la ficha de un
 * inmueble se vea igual en el panel y en la web no es cosmetico — el asesor
 * comprueba aqui lo que el cliente esta viendo alli.
 */
export const AVAILABILITY_COLOR: Record<string, string> = {
  AVAILABLE: '#2f7d4f', // 5,04:1
  RESERVED: '#8a6209', // 5,48:1
  SOLD: '#a81c1c', // 7,37:1
  RENTED: '#8a6209', // 5,48:1
  WITHDRAWN: '#6b6b6b', // 5,33:1
};

export const PUBLICATION_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Publicado',
  OUTSTANDING: 'Destacado',
  INACTIVE: 'Oculto',
};

export const CONDITION_LABEL: Record<string, string> = {
  NEW: 'Nuevo',
  USED: 'Usado',
  PROJECT: 'Sobre planos',
  UNDER_CONSTRUCTION: 'En construcción',
};

/*
 * Los nombres que usa la agencia al hablar. `MANAGER` y `COORDINATOR` caen en
 * la misma etiqueta a proposito: son el mismo puesto y el primero solo
 * sobrevive en los usuarios dados de alta antes del cambio de nombre; quien
 * mira el listado no tiene por que enterarse de esa historia.
 */
export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  DIRECTOR: 'Director de operaciones',
  COORDINATOR: 'Coordinador de sede',
  MANAGER: 'Coordinador de sede',
  AGENT: 'Asesor',
  VIEWER: 'Solo lectura',
};

export const INTEREST_ROLE_LABEL: Record<string, string> = {
  PROSPECT: 'Interesado',
  BUYER: 'Comprador',
  SELLER: 'Vendedor',
  OWNER: 'Propietario',
  TENANT: 'Arrendatario',
};

export const INTEREST_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierto',
  VISITED: 'Visitó',
  OFFER_MADE: 'Ofertó',
  CLOSED_WON: 'Cerrado',
  CLOSED_LOST: 'Perdido',
};

export const APPOINTMENT_TYPE_LABEL: Record<string, string> = {
  VISIT: 'Visita',
  CALL: 'Llamada',
  MEETING: 'Reunión',
  SIGNING: 'Firma',
  PHOTO_SHOOT: 'Fotografía',
  APPRAISAL: 'Avalúo',
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  DONE: 'Realizada',
  CANCELED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

export const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: 'Nota',
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
  VISIT: 'Visita',
  OFFER: 'Oferta',
  STAGE_CHANGE: 'Cambio de etapa',
  ASSIGNMENT: 'Asignación',
};

export const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
