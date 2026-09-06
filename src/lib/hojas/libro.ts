import type { CeldaPropia, CeldasPropias } from './almacen';
import { clave, desclave } from './almacen';
import type { Columna, Conjunto, TipoColumna, Valor } from './tipos';

/**
 * El paso de una tabla plana a una hoja de Univer, y la vuelta.
 *
 * Vive aparte del componente a proposito: es la parte de la que depende que las
 * formulas del usuario sigan apuntando a la celda correcta, y eso hay que
 * poder leerlo sin tener delante trescientas lineas de montaje de la libreria.
 */

/**
 * Formatos de numero, en la notacion de Excel que Univer entiende.
 *
 * Solo el dinero lleva formato. Los demas numeros se quedan en el general de la
 * hoja: el `#,##0.##` de Excel —decimales opcionales— Univer lo pinta dejando
 * el punto suelto, y un area de 53 m2 se leia "53." en toda la columna. Y las
 * fechas llegan de la API como texto ya formateado en la zona de Bogota, asi
 * que un formato de fecha aqui no tendria sobre que aplicarse.
 */
const FORMATO: Partial<Record<TipoColumna, string>> = {
  // Sin decimales: el inventario esta en pesos y nadie escribe centavos en una
  // consignacion de 430 millones.
  dinero: '"$"#,##0',
};

/** Los identificadores de estilo que se declaran en el libro. */
const ESTILO_CABECERA = 'cab';
const estiloColumna = (tipo: TipoColumna) => `col-${tipo}`;

/**
 * Cuantas filas y columnas tiene la hoja por encima de los datos.
 *
 * Univer necesita una rejilla declarada: si se hace del tamano exacto de los
 * datos, el usuario no tiene ni una celda libre donde escribir su formula. Se
 * deja sitio para trabajar al lado y debajo.
 */
const HOLGURA_FILAS = 200;
const HOLGURA_COLUMNAS = 8;

/** El ancho de columna segun lo que va a caer dentro. */
function ancho(columna: Columna): number {
  if (columna.tipo === 'dinero') return 140;
  if (columna.tipo === 'fecha') return 110;
  if (columna.tipo === 'numero' || columna.tipo === 'si-no') return 90;
  // Los titulos de inmueble y los requerimientos son largos; el resto de textos
  // son nombres y ciudades. 200 es el punto en el que casi todo cabe sin que la
  // hoja se vuelva un pergamino horizontal.
  return 200;
}

/**
 * Una celda de dato.
 *
 * Los numeros van como numeros y no como texto formateado — es lo que separa
 * una hoja de calculo de una captura de pantalla: si el precio entra como
 * "$ 430.000.000", no hay SUMA que valga.
 */
function celda(valor: Valor, tipo: TipoColumna): Record<string, unknown> {
  if (valor === null || valor === undefined || valor === '') return {};
  if (tipo === 'si-no') return { v: valor ? 'Sí' : 'No', t: 1 };
  if (typeof valor === 'number') return { v: valor, t: 2 };
  if (typeof valor === 'boolean') return { v: valor ? 'Sí' : 'No', t: 1 };
  return { v: String(valor), t: 1 };
}

export interface HojaConstruida {
  id: string;
  nombre: string;
  /** Cuantas filas ocupa el bloque de datos, cabecera incluida. */
  filasDatos: number;
  columnasDatos: number;
  datos: Record<string, unknown>;
}

/**
 * Construye una hoja a partir de una tabla y de las celdas propias del usuario.
 *
 * El bloque de datos ocupa siempre la esquina superior izquierda y la cabecera
 * queda congelada. Encima se pegan las celdas que escribio la persona; las
 * suyas ganan, porque si alguien tacho un valor a mano fue queriendo.
 */
export function construirHoja(
  id: string,
  nombre: string,
  conjunto: Conjunto,
  propias: CeldasPropias = {},
): HojaConstruida {
  const { columnas, filas } = conjunto;
  const cellData: Record<number, Record<number, unknown>> = {};

  cellData[0] = {};
  columnas.forEach((col, c) => {
    cellData[0][c] = { v: col.rotulo, t: 1, s: ESTILO_CABECERA };
  });

  filas.forEach((fila, f) => {
    const destino: Record<number, unknown> = {};
    columnas.forEach((col, c) => {
      const datos = celda(fila[col.clave], col.tipo);
      // Una celda vacia no se escribe: en el clientario hay columnas casi
      // enteras a null y guardar 7.532 objetos vacios por cada una engorda la
      // instantanea sin pintar nada distinto.
      if (Object.keys(datos).length === 0) return;
      destino[c] = { ...datos, s: estiloColumna(col.tipo) };
    });
    if (Object.keys(destino).length > 0) cellData[f + 1] = destino;
  });

  // Lo del usuario, encima de todo.
  let maxFila = filas.length;
  let maxColumna = columnas.length - 1;
  for (const [k, propia] of Object.entries(propias)) {
    const pos = desclave(k);
    if (!pos) continue;
    cellData[pos.fila] ??= {};
    cellData[pos.fila][pos.columna] = propia.f
      ? { f: propia.f }
      : celda(propia.v ?? null, 'texto');
    maxFila = Math.max(maxFila, pos.fila);
    maxColumna = Math.max(maxColumna, pos.columna);
  }

  return {
    id,
    nombre,
    filasDatos: filas.length + 1,
    columnasDatos: columnas.length,
    datos: {
      id,
      name: nombre,
      rowCount: maxFila + 1 + HOLGURA_FILAS,
      columnCount: maxColumna + 1 + HOLGURA_COLUMNAS,
      // La cabecera se queda fija: con 642 filas, a la tercera pantalla ya no
      // se sabe si la columna que se esta mirando es el area o el estrato.
      freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
      defaultColumnWidth: 110,
      defaultRowHeight: 24,
      cellData,
      columnData: Object.fromEntries(columnas.map((col, c) => [c, { w: ancho(col) }])),
      rowData: {},
      mergeData: [],
    },
  };
}

/** Los estilos que declara el libro; se referencian por id desde cada celda. */
export function estilos(): Record<string, unknown> {
  const salida: Record<string, unknown> = {
    [ESTILO_CABECERA]: {
      bl: 1,
      bg: { rgb: '#f1f5f9' },
      cl: { rgb: '#0f172a' },
      bd: { b: { s: 1, cl: { rgb: '#cbd5e1' } } },
    },
  };
  for (const tipo of ['texto', 'numero', 'dinero', 'fecha', 'si-no'] as TipoColumna[]) {
    const formato = FORMATO[tipo];
    salida[estiloColumna(tipo)] = formato ? { n: { pattern: formato } } : {};
  }
  return salida;
}

/**
 * Separa lo que escribio el usuario de lo que trajo la API.
 *
 * Es la regla que decide que se guarda en el navegador y que no, asi que va
 * escrita en un solo sitio: es propio de la persona todo lo que lleve formula
 * —ahi no hay dato del CRM que valga— y todo lo que caiga fuera del rectangulo
 * de datos. Lo de dentro sin formula son las cifras de la agencia y esas se
 * vuelven a pedir siempre.
 */
export function celdasPropias(
  cellData: Record<string, Record<string, { v?: unknown; f?: unknown }>> | undefined,
  filasDatos: number,
  columnasDatos: number,
): CeldasPropias {
  const salida: CeldasPropias = {};
  if (!cellData) return salida;

  for (const [filaStr, columnasDeLaFila] of Object.entries(cellData)) {
    const fila = Number(filaStr);
    if (!Number.isInteger(fila)) continue;

    for (const [colStr, valor] of Object.entries(columnasDeLaFila ?? {})) {
      const columna = Number(colStr);
      if (!Number.isInteger(columna) || !valor) continue;

      const dentro = fila < filasDatos && columna < columnasDatos;
      const formula = typeof valor.f === 'string' && valor.f.length > 0;
      if (dentro && !formula) continue;

      const propia: CeldaPropia = formula
        ? { f: valor.f as string }
        : { v: (valor.v ?? null) as CeldaPropia['v'] };
      // Una celda que quedo del todo vacia no es nada que recordar.
      if (!formula && (propia.v === null || propia.v === '')) continue;
      salida[clave(fila, columna)] = propia;
    }
  }

  return salida;
}
