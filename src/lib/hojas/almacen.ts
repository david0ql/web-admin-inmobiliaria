import type { HojaGuardada } from './tipos';

/**
 * Lo que sobrevive a la recarga.
 *
 * La pantalla es volatil: nada de lo que se monte aqui vuelve al CRM. Pero
 * volatil no puede querer decir que un consolidado de comisiones se evapore al
 * pulsar F5 — quien pierde su trabajo una vez no vuelve a usar la herramienta.
 *
 * Asi que se guarda la RECETA y jamas los datos: que hojas hay montadas, sobre
 * que origen, con que dinamica, y las celdas que ha escrito la persona. Las
 * cifras se vuelven a pedir siempre a la API, por dos razones que van juntas:
 * nadie trabaja sin darse cuenta sobre un inventario de hace tres dias, y no
 * queda el telefono de 7.532 clientes reales tirado en el localStorage de un
 * navegador compartido.
 */

const CLAVE = 'serrano.hojas.v1';

/** Una celda escrita por el usuario: valor literal o formula. */
export interface CeldaPropia {
  /** El texto o numero tal cual se tecleo. */
  v?: string | number | boolean | null;
  /** La formula, con su `=` delante. */
  f?: string;
}

/** Las celdas propias de una hoja, indexadas por `"fila,columna"`. */
export type CeldasPropias = Record<string, CeldaPropia>;

export interface Guardado {
  hojas: HojaGuardada[];
  celdas: Record<string, CeldasPropias>;
}

const VACIO: Guardado = { hojas: [], celdas: {} };

/**
 * Lo que hay guardado.
 *
 * Todo lo que venga raro se descarta y se empieza de cero: es una comodidad,
 * no un dato del que dependa nadie, y arrastrar una estructura vieja rompe la
 * pantalla entera en vez de perder una hoja. `localStorage` ademas revienta en
 * ventanas privadas y con las cookies de sitio bloqueadas.
 */
export function leer(): Guardado {
  try {
    const bruto = localStorage.getItem(CLAVE);
    if (!bruto) return VACIO;
    const datos = JSON.parse(bruto) as Partial<Guardado>;
    if (!Array.isArray(datos.hojas)) return VACIO;
    return {
      hojas: datos.hojas.filter((h) => h && typeof h.id === 'string' && typeof h.origen === 'string'),
      celdas: typeof datos.celdas === 'object' && datos.celdas !== null ? datos.celdas : {},
    };
  } catch {
    return VACIO;
  }
}

/**
 * Guarda la receta.
 *
 * Si el navegador dice que no hay sitio se calla: la alternativa es reventar la
 * pantalla en mitad de una edicion por no poder guardar una comodidad.
 */
export function escribir(datos: Guardado): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Sin sitio o sin permiso: se sigue trabajando, solo que sin memoria.
  }
}

export function borrar(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer.
  }
}

/** La clave con la que se indexa una celda propia. */
export function clave(fila: number, columna: number): string {
  return `${fila},${columna}`;
}

/** Deshace `clave`. Devuelve `null` si el texto guardado no tiene sentido. */
export function desclave(k: string): { fila: number; columna: number } | null {
  const [f, c] = k.split(',').map(Number);
  if (!Number.isInteger(f) || !Number.isInteger(c) || f < 0 || c < 0) return null;
  return { fila: f, columna: c };
}
