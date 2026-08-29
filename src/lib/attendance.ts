import { api } from './api';

/**
 * El contrato de asistencia y la hora de Colombia.
 *
 * Todo lo que la pantalla sabe de la API vive aqui —tipos y llamadas— para que
 * un cambio del backend se arregle en un fichero y no repartido por la vista.
 * Los tipos son los de `api/src/modules/attendance/attendance.service.ts`.
 */

export type AttendanceMarkType = 'IN' | 'OUT';

/**
 * Una marca tal y como la devuelve la API.
 *
 * `date` y `time` vienen ya calculados en Bogota por el servidor: son la
 * verdad de a que dia pertenece la marca —agrupar por UTC parte las jornadas
 * de la noche— y la pantalla no tiene que reconvertir nada.
 */
export interface AttendanceMark {
  id: string;
  type: AttendanceMarkType;
  /** El instante en ISO con zona. Sirve para durar, no para agrupar. */
  at: string;
  /** El dia de calendario en Bogota, `AAAA-MM-DD`. */
  date: string;
  /** La hora en Bogota, ya formateada. */
  time: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  address: string | null;
  agentId: string;
  agentName: string;
  branchId: string | null;
  branchName: string | null;
}

/** El par entrada-salida. `checkOut` nulo = sigue dentro. */
export interface AttendanceSession {
  checkIn: AttendanceMark | null;
  checkOut: AttendanceMark | null;
  minutes: number | null;
  open: boolean;
}

/** El consolidado de un dia. */
export interface AttendanceDay {
  date: string;
  agentId: string;
  agentName: string;
  branchId: string | null;
  branchName: string | null;
  marks: AttendanceMark[];
  sessions: AttendanceSession[];
  /** Suma de los pares cerrados: lo que sigue abierto no cuenta todavia. */
  workedMinutes: number;
  open: boolean;
}

/** Mi estado de hoy. */
export interface TodayStatus {
  date: string;
  /** Si ahora mismo estoy dentro; lo dice la ultima marca, no el reloj. */
  working: boolean;
  lastMark: AttendanceMark | null;
  /** Instante de la entrada abierta, si la hay. */
  openSince: string | null;
  openMinutes: number | null;
  marks: AttendanceMark[];
  sessions: AttendanceSession[];
  workedMinutes: number;
}

export interface MyHistory {
  from: string;
  to: string;
  days: AttendanceDay[];
  workedMinutes: number;
}

export interface NewMark {
  type: AttendanceMarkType;
  latitude: number;
  longitude: number;
  accuracyM?: number;
}

export const attendance = {
  today: (signal?: AbortSignal) => api.get<TodayStatus>('/attendance/today', undefined, signal),

  mine: (from: string, to: string, signal?: AbortSignal) =>
    api.get<MyHistory>('/attendance/me', { from, to }, signal),

  /*
    Marcar devuelve tambien el estado del dia, y la pantalla lo usa tal cual en
    lugar de volver a preguntar: asi lo que se ve despues de marcar no depende
    de que dos respuestas lleguen en orden.
  */
  mark: (body: NewMark) =>
    api.post<{ mark: AttendanceMark; status: TodayStatus }>('/attendance/marks', body),
};

// --- hora de Colombia ------------------------------------------------------

/*
  La jornada se mide en GMT-5 y no en la zona del navegador.

  Quien viaja —o tiene el portatil mal puesto— veria su dia movido: una salida
  de las 18:00 de Bucaramanga leida en Madrid son la una de la madrugada del
  dia siguiente, y el consolidado del martes acabaria contando horas del lunes.
  Colombia no tiene horario de verano, asi que el desfase es fijo todo el año.
*/
const COLOMBIA = 'America/Bogota';

/** Hoy en Bogota como `AAAA-MM-DD`. `en-CA` es el unico locale que da ese orden. */
export function bogotaToday(offsetDays = 0): string {
  const at = new Date(Date.now() + offsetDays * 86_400_000);
  return at.toLocaleDateString('en-CA', { timeZone: COLOMBIA });
}

export function hour(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('es-CO', {
    timeZone: COLOMBIA,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `sábado, 29 de agosto de 2026 a las 8:03 a. m.` */
export function longDateTime(value: string): string {
  const at = new Date(value);
  const day = at.toLocaleDateString('es-CO', {
    timeZone: COLOMBIA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${day} a las ${hour(value)}`;
}

/**
 * Etiqueta de un dia del historial.
 *
 * `new Date('2026-08-29')` es medianoche UTC, que en Bogota son las siete de la
 * tarde del 28: pasado por el formateador saldria el dia anterior. Anclando al
 * mediodia con el desfase explicito no hay borde que valga.
 */
export function dayLabel(date: string): string {
  const at = new Date(`${date}T12:00:00-05:00`);
  const today = bogotaToday();
  if (date === today) return 'Hoy';
  if (date === bogotaToday(-1)) return 'Ayer';
  return at.toLocaleDateString('es-CO', {
    timeZone: COLOMBIA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** `7 h 45 min`. Las horas de una jornada no se leen en decimales. */
export function duration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

// --- historia del equipo ---------------------------------------------------

/*
  Lo que consume el panel de historia (`pages/AttendanceHistory.tsx`).

  Va en este mismo modulo y no en uno aparte porque es el mismo dominio y la
  misma API: partirlo obligaria a mirar en dos sitios para saber como viaja una
  marca. Los nombres son literalmente los del servidor
  (`api/src/modules/attendance/attendance.service.ts`) para que un `grep` por
  un campo cruce los dos lados.
*/

/**
 * Una marca tal y como la devuelve la historia.
 *
 * `date` y `time` vienen ya calculados en Bogota por Postgres —el mismo
 * `AT TIME ZONE` con el que se agruparon los dias— y por eso se pintan tal
 * cual: convertirlos otra vez en el navegador abriria la puerta a que una marca
 * se agrupe en un dia y se enseñe con la fecha de otro.
 */
export interface TeamMark {
  id: string;
  type: AttendanceMarkType;
  /** Instante en ISO con zona (UTC). */
  at: string;
  /** `AAAA-MM-DD` en Bogota. */
  date: string;
  /** `HH:MM` en Bogota, 24 h. */
  time: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  address: string | null;
  agentId: string;
  agentName: string;
  branchId: string | null;
  branchName: string | null;
}

/**
 * Una jornada: el par entrada-salida.
 *
 * Las dos puntas pueden faltar y significan cosas distintas. Sin `checkOut`, la
 * persona sigue dentro y `minutes` es nulo porque nadie ha declarado a que hora
 * salio. Sin `checkIn`, la entrada quedo fuera del rango consultado: es un dato
 * incompleto y se enseña como tal, no se esconde.
 */
export interface TeamSession {
  checkIn: TeamMark | null;
  checkOut: TeamMark | null;
  minutes: number | null;
  open: boolean;
}

/** El consolidado de una persona en un dia. */
export interface TeamDay {
  date: string;
  agentId: string;
  agentName: string;
  branchId: string | null;
  branchName: string | null;
  marks: TeamMark[];
  sessions: TeamSession[];
  /** Suma de los pares CERRADOS: lo que sigue abierto no cuenta. */
  workedMinutes: number;
  open: boolean;
}

export interface TeamAgentTotals {
  agentId: string;
  agentName: string;
  branchId: string | null;
  branchName: string | null;
  days: number;
  workedMinutes: number;
  openSessions: number;
}

export interface TeamHistory {
  from: string;
  to: string;
  days: TeamDay[];
  agents: TeamAgentTotals[];
  /** Se alcanzo el tope de marcas: lo que se ve no es todo lo que hay. */
  truncated: boolean;
}

export interface TeamHistoryQuery {
  /** Fechas de calendario en Bogota, `AAAA-MM-DD`, ambas incluidas. */
  from: string;
  to: string;
  agentId?: string;
}

export function teamHistory(
  query: TeamHistoryQuery,
  signal?: AbortSignal,
): Promise<TeamHistory> {
  return api.get<TeamHistory>('/attendance/history', { ...query }, signal);
}

/**
 * La clave de una jornada.
 *
 * La API no le pone id —una jornada es un par, no una fila— asi que se usa el
 * de su marca de entrada, que es unico. Sirve para señalarla en el mapa desde
 * la lista y al reves, y para que viaje en la URL.
 */
export function sessionKey(session: TeamSession): string {
  return session.checkIn?.id ?? session.checkOut?.id ?? '';
}

/**
 * A partir de cuantos metros de incertidumbre la marca deja de situar a nadie.
 *
 * Es UN solo umbral para las dos pantallas —la de fichar y la de la historia—
 * y no puede haber dos: si al fichar se avisa a partir de 100 y en el historial
 * se marca dudoso a partir de 80, alguien ficha sin ver ningun aviso y luego
 * aparece señalado sin explicacion posible.
 *
 * 100 m y no menos porque el umbral no debe saltar en el uso normal: fichar
 * bajo techo con posicion por red da decenas de metros de error a diario, y un
 * aviso que sale siempre no informa de nada. El numero no es sagrado, pero el
 * criterio si: se avisa cuando el dato deja de sostener la conclusion que
 * alguien va a sacar de el.
 */
export const LOOSE_ACCURACY_M = 100

export function looseAccuracy(mark: TeamMark | null | undefined): boolean {
  return !!mark && mark.accuracyM !== null && mark.accuracyM > LOOSE_ACCURACY_M
}

/** `±12 m`, que es lo que de verdad dice el dato de precision. */
export function accuracyLabel(mark: TeamMark | null | undefined): string {
  if (!mark || mark.accuracyM === null || !Number.isFinite(mark.accuracyM)) {
    return 'precisión desconocida'
  }
  return `±${Math.round(mark.accuracyM)} m`
}

/** Que la marca se puede poner en un mapa. */
export function hasPoint(mark: TeamMark | null | undefined): mark is TeamMark {
  return (
    !!mark &&
    Number.isFinite(Number(mark.latitude)) &&
    Number.isFinite(Number(mark.longitude))
  )
}

// --- calendario ------------------------------------------------------------

/**
 * Suma dias a una fecha `AAAA-MM-DD` sin salir del calendario.
 *
 * Se opera en UTC a proposito: la fecha es una etiqueta de dia, no un instante,
 * y hacerlo en local podria devolver la vispera al volver a formatear.
 */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Cuantos dias hay entre dos `AAAA-MM-DD`, contando los dos extremos. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/**
 * `12 ago 2026`. La version corta de `dayLabel`, para una tabla donde el dia es
 * una columna y no un encabezado.
 */
export function dayShort(date: string | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  // Anclado al mediodia por lo mismo que `dayLabel`: medianoche UTC en Bogota
  // es la vispera.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CO', {
    timeZone: COLOMBIA,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
