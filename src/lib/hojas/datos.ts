import { api } from '../api';
import type { Columna, Conjunto, Fila, TipoColumna, Valor } from './tipos';

/**
 * De donde salen las hojas.
 *
 * Todo viene de `/datasets`, que la API sirve YA PLANO: una fila por registro,
 * las columnas descritas con su rotulo en castellano y su tipo, y el acotado
 * por sede y por asesor aplicado en la consulta. El panel no aplana nada ni
 * decide quien ve que — solo traduce dos vocabularios de tipos y pagina.
 *
 * Esta capa es la unica que sabe de la forma de la API: ni la dinamica, ni el
 * libro, ni el exportador conocen una ruta.
 */

/** El tipo de columna tal y como lo nombra la API. */
type TipoApi = 'texto' | 'numero' | 'moneda' | 'fecha' | 'fechaHora' | 'booleano';

interface ColumnaApi {
  key: string;
  label: string;
  tipo: TipoApi;
}

/** La ficha de una hoja en el catalogo, sin traerse las filas. */
interface FichaApi {
  nombre: string;
  titulo: string;
  descripcion: string;
  columns: ColumnaApi[];
  /** Cuantas filas ve QUIEN PREGUNTA, ya acotado. */
  total: number;
}

interface HojaApi {
  dataset: string;
  titulo: string;
  descripcion: string;
  columns: ColumnaApi[];
  /** Arrays paralelos a `columns`. */
  rows: Valor[][];
  count: number;
  total: number;
  offset: number;
  truncated: boolean;
  nextOffset: number | null;
  generatedAt: string;
}

/**
 * Cuantas filas se piden por vuelta.
 *
 * La API topa en 20.000 y sirve 10.000 por defecto. Con 642 inmuebles y 7.532
 * clientes, cada hoja de hoy entra en una sola peticion; el bucle de paginado
 * existe para el dia en que no.
 */
const POR_PETICION = 10_000;

/**
 * El tope de vueltas por hoja.
 *
 * Existe para que un `nextOffset` que nunca se apague no deje al navegador
 * pidiendo paginas hasta quedarse sin memoria. Diez vueltas son 100.000 filas:
 * quince veces el clientario entero. Cuando se toca, la pantalla lo dice en vez
 * de callarse.
 */
const MAX_PETICIONES = 10;

/**
 * Los dos vocabularios de tipos.
 *
 * Las fechas se quedan como TEXTO a proposito. La API ya las formatea en la
 * zona de Bogota (`YYYY-MM-DD`), asi que convertirlas aqui a un serial de Excel
 * solo abriria la puerta a que una cita del 31 de julio a las nueve de la noche
 * se lea con fecha del 1 de agosto. Ademas asi lo que se ve en el panel es
 * exactamente lo que sale en el XLSX.
 */
const TIPO: Record<TipoApi, TipoColumna> = {
  texto: 'texto',
  numero: 'numero',
  moneda: 'dinero',
  fecha: 'fecha',
  fechaHora: 'fecha',
  booleano: 'si-no',
};

function columna(col: ColumnaApi): Columna {
  return { clave: col.key, rotulo: col.label, tipo: TIPO[col.tipo] ?? 'texto' };
}

export interface Cargado {
  conjunto: Conjunto;
  /** Cuantas filas dice la API que hay dentro del alcance de quien pregunta. */
  total: number;
  /** `true` si se llego al tope de vueltas y quedaron filas sin traer. */
  recortado: boolean;
  /** Cuando las calculo el servidor. */
  generadoEl: string | null;
}

/** Que hojas hay. Una sola peticion al abrir la pantalla. */
export function catalogo(signal: AbortSignal): Promise<FichaApi[]> {
  return api.get<FichaApi[]>('/datasets', undefined, signal);
}

export type Ficha = FichaApi;

/**
 * Trae una hoja entera.
 *
 * Las paginas van una detras de otra y no en paralelo: son consultas contra la
 * base de produccion de la agencia, y dispararlas todas a la vez es la forma
 * mas rapida de que el servidor empiece a devolver errores.
 */
export async function cargar(
  ficha: FichaApi,
  signal: AbortSignal,
  progreso?: (traidas: number, total: number) => void,
): Promise<Cargado> {
  const columnas = ficha.columns.map(columna);
  const filas: Fila[] = [];
  let offset = 0;
  let generadoEl: string | null = null;
  let recortado = false;

  for (let vuelta = 0; ; vuelta++) {
    const res = await api.get<HojaApi>(
      `/datasets/${ficha.nombre}`,
      { format: 'filas', limit: POR_PETICION, offset },
      signal,
    );
    generadoEl = res.generatedAt;

    for (const bruta of res.rows) {
      const fila: Fila = {};
      // `rows` son arrays paralelos a `columns`: se casan por posicion, que es
      // el contrato de la API y lo que evita repetir veinte nombres de campo
      // siete mil veces por el cable.
      columnas.forEach((col, i) => {
        fila[col.clave] = bruta[i] ?? null;
      });
      filas.push(fila);
    }
    progreso?.(filas.length, res.total);

    if (res.nextOffset === null) break;
    if (vuelta + 1 >= MAX_PETICIONES) {
      recortado = true;
      break;
    }
    offset = res.nextOffset;
  }

  return {
    total: ficha.total,
    recortado,
    generadoEl,
    conjunto: {
      clave: ficha.nombre,
      titulo: ficha.titulo,
      descripcion: ficha.descripcion,
      columnas,
      filas,
    },
  };
}
