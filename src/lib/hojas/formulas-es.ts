/**
 * El puente entre el Excel que la gente tiene en la cabeza y el motor de Univer.
 *
 * Univer trae su interfaz y sus 528 descripciones de funcion en castellano,
 * pero los NOMBRES de funcion solo existen en ingles: `=SUMAR.SI(...)` devuelve
 * `#NAME?`. En una agencia colombiana eso pasa el primer dia, y un `#NAME?` sin
 * explicacion se lee como que la herramienta esta rota.
 *
 * Aqui NO se traduce la formula. Se detecta el nombre en castellano para poder
 * decir en pantalla como se llama aqui. Reescribir lo que alguien teclea es
 * tentador y es peor: el motor tiene 505 funciones implementadas con las
 * esquinas de Excel —los comodines de un criterio, el `">100"` de un SUMAR.SI—
 * y cualquier reimplementacion nuestra acabaria discrepando en algun caso raro
 * sin que nadie se entere. Es preferible un error honesto con su explicacion al
 * lado que un numero plausible y equivocado.
 */

/**
 * Los nombres que de verdad se teclean.
 *
 * No estan las 505: estan las que escribe quien lleva un inventario y una
 * cartera de clientes. Las que se llaman igual en los dos idiomas —MAX, MIN,
 * ABS— no hacen falta aqui, porque esas ya funcionan.
 */
const EQUIVALENTE: Record<string, string> = {
  // Cuentas y sumas: el 90 % de lo que se escribe en esta pantalla.
  SUMA: 'SUM',
  'SUMAR.SI': 'SUMIF',
  'SUMAR.SI.CONJUNTO': 'SUMIFS',
  SUMAPRODUCTO: 'SUMPRODUCT',
  PROMEDIO: 'AVERAGE',
  'PROMEDIO.SI': 'AVERAGEIF',
  'PROMEDIO.SI.CONJUNTO': 'AVERAGEIFS',
  CONTAR: 'COUNT',
  CONTARA: 'COUNTA',
  'CONTAR.SI': 'COUNTIF',
  'CONTAR.SI.CONJUNTO': 'COUNTIFS',
  'CONTAR.BLANCO': 'COUNTBLANK',
  SUBTOTALES: 'SUBTOTAL',
  MEDIANA: 'MEDIAN',
  MODA: 'MODE',
  DESVEST: 'STDEV',
  'K.ESIMO.MAYOR': 'LARGE',
  'K.ESIMO.MENOR': 'SMALL',
  PERCENTIL: 'PERCENTILE',
  JERARQUIA: 'RANK',

  // Buscar cosas en otra hoja: el cruce entre inmuebles, clientes y relaciones.
  BUSCARV: 'VLOOKUP',
  BUSCARH: 'HLOOKUP',
  BUSCARX: 'XLOOKUP',
  INDICE: 'INDEX',
  COINCIDIR: 'MATCH',
  ELEGIR: 'CHOOSE',
  DESREF: 'OFFSET',
  INDIRECTO: 'INDIRECT',
  FILA: 'ROW',
  COLUMNA: 'COLUMN',
  FILTRAR: 'FILTER',
  ORDENAR: 'SORT',
  UNICOS: 'UNIQUE',

  // Condiciones.
  SI: 'IF',
  'SI.ERROR': 'IFERROR',
  'SI.ND': 'IFNA',
  'SI.CONJUNTO': 'IFS',
  Y: 'AND',
  O: 'OR',
  NO: 'NOT',
  VERDADERO: 'TRUE',
  FALSO: 'FALSE',
  ESNUMERO: 'ISNUMBER',
  ESTEXTO: 'ISTEXT',
  ESBLANCO: 'ISBLANK',
  ESERROR: 'ISERROR',

  // Numeros.
  REDONDEAR: 'ROUND',
  'REDONDEAR.MAS': 'ROUNDUP',
  'REDONDEAR.MENOS': 'ROUNDDOWN',
  'REDOND.MULT': 'MROUND',
  ENTERO: 'INT',
  TRUNCAR: 'TRUNC',
  RESIDUO: 'MOD',
  POTENCIA: 'POWER',
  RAIZ: 'SQRT',
  ALEATORIO: 'RAND',

  // Texto: nombres de cliente, codigos de inmueble.
  TEXTO: 'TEXT',
  CONCATENAR: 'CONCATENATE',
  UNIRCADENAS: 'TEXTJOIN',
  IZQUIERDA: 'LEFT',
  DERECHA: 'RIGHT',
  EXTRAE: 'MID',
  LARGO: 'LEN',
  HALLAR: 'SEARCH',
  ENCONTRAR: 'FIND',
  SUSTITUIR: 'SUBSTITUTE',
  REEMPLAZAR: 'REPLACE',
  ESPACIOS: 'TRIM',
  MAYUSC: 'UPPER',
  MINUSC: 'LOWER',
  NOMPROPIO: 'PROPER',
  VALOR: 'VALUE',

  // Fechas. Ojo: las fechas de estas hojas llegan como texto ya formateado, asi
  // que restar dos no funciona aunque la funcion exista. Si alguien necesita
  // "dias desde la ultima gestion", esa columna la saca la API ya calculada.
  HOY: 'TODAY',
  AHORA: 'NOW',
  FECHA: 'DATE',
  'AÑO': 'YEAR',
  ANO: 'YEAR',
  MES: 'MONTH',
  DIA: 'DAY',
  SIFECHA: 'DATEDIF',
  'DIAS.LAB': 'NETWORKDAYS',

  // Financieras: se usan al calcular comisiones y cuotas.
  PAGO: 'PMT',
  TASA: 'RATE',
  VNA: 'NPV',
  TIR: 'IRR',
  VF: 'FV',
  VA: 'PV',
};

export interface NombreEnCastellano {
  /** Lo que la persona escribio. */
  escrito: string;
  /** Como se llama aqui. */
  ingles: string;
}

/**
 * Quita lo que va entre comillas dobles.
 *
 * Sin esto, `=SUMIF(A:A;"SUMAR.SI")` —buscar las celdas que digan literalmente
 * "SUMAR.SI"— saltaria el aviso. Es rebuscado, pero un criterio de busqueda es
 * texto de la persona y no tenemos por que mirarlo. Se sustituye por espacios
 * en lugar de borrarlo para no pegar dos trozos que no iban juntos.
 */
function sinTextos(formula: string): string {
  return formula.replace(/"(?:[^"]|"")*"/g, (t) => ' '.repeat(t.length));
}

/**
 * Busca un nombre de funcion en castellano dentro de una formula.
 *
 * Solo cuenta si va en posicion de funcion, es decir seguido de un parentesis:
 * asi una celda con nombre definido `SI` o una referencia no disparan el aviso.
 * Devuelve `null` cuando no hay nada que avisar, que es lo normal.
 */
export function nombreEnCastellano(formula: string): NombreEnCastellano | null {
  if (!formula.startsWith('=')) return null;

  const limpia = sinTextos(formula);
  // Las letras con tilde y la eñe entran en el nombre: `AÑO` es una funcion.
  for (const [, nombre] of limpia.matchAll(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9.]*)\s*\(/gi)) {
    const clave = nombre.toUpperCase();
    const ingles = EQUIVALENTE[clave];
    // Si se llama igual en los dos idiomas no hay nada que explicar.
    if (ingles && ingles !== clave) return { escrito: clave, ingles };
  }

  return null;
}
