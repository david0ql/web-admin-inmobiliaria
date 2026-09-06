/**
 * El vocabulario de la pantalla de hojas.
 *
 * Todo lo que entra al libro es lo mismo: una tabla plana con sus columnas
 * descritas. Da igual que venga de inmuebles, de clientes o de una dinamica
 * calculada aqui — asi el volcado a Univer, el exportador y la dinamica se
 * escriben una sola vez y no una por origen.
 */

/** De que tipo es una columna. Decide alineacion, formato y si se puede sumar. */
export type TipoColumna = 'texto' | 'numero' | 'dinero' | 'fecha' | 'si-no';

export interface Columna {
  /** La clave con la que viene el valor en cada fila. */
  clave: string;
  /** Lo que se lee en la cabecera. Siempre en castellano. */
  rotulo: string;
  tipo: TipoColumna;
}

/** Una celda ya resuelta: sin objetos ni arrays, que a una hoja no le caben. */
export type Valor = string | number | boolean | null;

export type Fila = Record<string, Valor>;

/**
 * Una tabla lista para volcar en una hoja.
 *
 * `clave` es estable y es con la que se recuerda la definicion guardada: si
 * cambiase, quien tuviera un consolidado montado lo perderia.
 */
export interface Conjunto {
  clave: string;
  titulo: string;
  /** Una linea que explique de que va la hoja; se pinta en el selector. */
  descripcion?: string;
  columnas: Columna[];
  filas: Fila[];
}

// --- tabla dinamica --------------------------------------------------------

/** Las cuentas que se pueden hacer sobre una columna. */
export type Agregado = 'suma' | 'media' | 'cuenta' | 'minimo' | 'maximo';

export const AGREGADO_ROTULO: Record<Agregado, string> = {
  suma: 'Suma',
  media: 'Promedio',
  cuenta: 'Cuenta',
  minimo: 'Mínimo',
  maximo: 'Máximo',
};

export interface Medida {
  /** La columna sobre la que se cuenta. En `cuenta` puede ser cualquiera. */
  campo: string;
  agregado: Agregado;
}

/**
 * La definicion de una dinamica.
 *
 * Dos dimensiones en filas y una en columnas es lo que se pide de verdad
 * —"venta por ciudad y tipo", "clientes por asesor y etapa"— y es lo que cabe
 * mirar de un vistazo. No hay tercer nivel a proposito: con 642 inmuebles, una
 * tabla de tres dimensiones anidadas tiene mas filas que el propio inventario.
 */
export interface Dinamica {
  /** Sobre que conjunto se calcula. */
  origen: string;
  /** Hasta dos dimensiones anidadas en las filas. */
  filas: string[];
  /** Una dimension que se abre en columnas. Vacio: solo las medidas. */
  columna: string | null;
  medidas: Medida[];
}

/**
 * Lo que se guarda en el navegador de cada uno.
 *
 * Se guarda la RECETA, nunca los datos: las hojas montadas sobreviven a la
 * recarga, pero las cifras se vuelven a pedir siempre a la API. Asi nadie
 * trabaja sobre un inventario de hace tres dias sin enterarse, y no queda
 * informacion de clientes reales tirada en el localStorage del navegador.
 */
export interface HojaGuardada {
  /** Identificador propio de la hoja montada por el usuario. */
  id: string;
  nombre: string;
  /** El conjunto de origen, o la dinamica que la calcula. */
  origen: string;
  dinamica?: Dinamica;
}
