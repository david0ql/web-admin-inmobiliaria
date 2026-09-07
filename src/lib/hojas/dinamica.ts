import {
  AGREGADO_ROTULO,
  type Agregado,
  type Columna,
  type Conjunto,
  type Dinamica,
  type Fila,
  type Medida,
  type TipoColumna,
  type Valor,
} from './tipos';

/**
 * La tabla dinamica.
 *
 * La de Univer es de pago y ademas no se puede comprar, asi que esta escrita
 * aqui. No pretende ser la de Excel: agrupa por una o dos dimensiones, abre
 * una tercera en columnas y agrega. Eso cubre lo que una inmobiliaria pide
 * —inventario por ciudad y tipo, cartera por asesor y etapa— y con 642
 * inmuebles y 7.532 clientes cabe entero en memoria sin pensarlo.
 *
 * El resultado es un `Conjunto` como cualquier otro: se vuelca a la hoja como
 * VALORES, no como una tabla viva. Es a proposito — encima de esos numeros el
 * usuario tiene que poder escribir sus propias formulas, y una region que se
 * recalcula sola se las borraria.
 */

/** Lo que se pinta cuando una dimension no tiene valor. */
const SIN_VALOR = '(sin dato)';

/**
 * El texto con el que se agrupa y se ordena una celda de dimension.
 *
 * Las fechas se recortan al mes. Agrupar por el dia exacto devuelve casi una
 * fila por registro y no responde a nada; "cuanto se cerro en marzo" si. Como
 * la API las sirve ya formateadas `YYYY-MM-DD` en la zona de Bogota, recortar
 * a siete caracteres es exacto y ordena solo.
 */
function etiqueta(valor: Valor, tipo?: TipoColumna): string {
  if (valor === null || valor === undefined || valor === '') return SIN_VALOR;
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  const texto = String(valor);
  if (tipo === 'fecha') return texto.slice(0, 7);
  return texto;
}

/** Solo cuentan los numeros de verdad: un texto en una columna numerica no suma. */
function numero(valor: Valor): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * La cuenta de un grupo.
 *
 * `cuenta` cuenta filas, no valores: es lo que espera quien pregunta "cuantos
 * inmuebles hay en Floridablanca". Las demas ignoran los huecos —promediar
 * tratando un precio ausente como cero mentiria—, y devuelven `null` cuando no
 * quedo ningun numero, que la hoja pinta como celda vacia y no como un cero.
 */
function agregar(agregado: Agregado, valores: Valor[]): number | null {
  if (agregado === 'cuenta') return valores.length;

  const numeros: number[] = [];
  for (const v of valores) {
    const n = numero(v);
    if (n !== null) numeros.push(n);
  }
  if (numeros.length === 0) return null;

  switch (agregado) {
    case 'suma':
      return numeros.reduce((a, b) => a + b, 0);
    case 'media':
      return numeros.reduce((a, b) => a + b, 0) / numeros.length;
    case 'minimo':
      return Math.min(...numeros);
    case 'maximo':
      return Math.max(...numeros);
  }
}

/**
 * El tipo que sale de agregar.
 *
 * Una suma de pesos sigue siendo pesos y un promedio tambien, pero una CUENTA
 * de inmuebles no: son unidades. Sin esto, "cuantos inmuebles" se leeria
 * "$ 642" en la hoja.
 */
function tipoResultado(agregado: Agregado, origen: TipoColumna | undefined): TipoColumna {
  if (agregado === 'cuenta') return 'numero';
  return origen === 'dinero' ? 'dinero' : 'numero';
}

function rotuloMedida(medida: Medida, columnas: Columna[]): string {
  const col = columnas.find((c) => c.clave === medida.campo);
  const nombre = col?.rotulo ?? medida.campo;
  if (medida.agregado === 'cuenta') return 'Cuenta';
  return `${AGREGADO_ROTULO[medida.agregado]} de ${nombre}`;
}

/**
 * Ordena las etiquetas de una dimension.
 *
 * En castellano, con `localeCompare`: sin el, "Ávila" cae detras de "Zapatoca".
 * Lo que no tiene dato se va siempre al final, aunque alfabeticamente el
 * parentesis fuese primero — es un hueco, no una categoria.
 */
function ordenar(etiquetas: string[]): string[] {
  return [...etiquetas].sort((a, b) => {
    if (a === SIN_VALOR && b === SIN_VALOR) return 0;
    if (a === SIN_VALOR) return 1;
    if (b === SIN_VALOR) return -1;
    return a.localeCompare(b, 'es-CO', { numeric: true, sensitivity: 'base' });
  });
}

export interface ResultadoDinamica {
  conjunto: Conjunto;
  /** Cuantas filas del origen entraron: se dice en pantalla. */
  filasOrigen: number;
}

/**
 * Calcula la dinamica sobre un conjunto y devuelve otro conjunto.
 *
 * Una sola pasada por los datos para juntar los valores de cada cruce, y otra
 * para agregarlos. Con los volumenes de esta agencia daria igual, pero agrupar
 * recorriendo los datos una vez por celda de salida seria cuadratico y se
 * notaria en cuanto el inventario creciera.
 */
export function calcular(origen: Conjunto, def: Dinamica): ResultadoDinamica {
  const dimFilas = def.filas.filter(Boolean).slice(0, 2);
  const medidas: Medida[] =
    def.medidas.length > 0 ? def.medidas : [{ campo: '', agregado: 'cuenta' }];
  const dimCol = def.columna || null;

  /*
    Se guardan los valores en bruto de cada cruce, no un acumulador: el promedio
    y el minimo necesitan la lista entera. El mapa va
    clave-de-fila -> etiqueta-de-columna -> valores de cada medida.
  */
  const columnasOrigen = origen.columnas;
  const grupos = new Map<string, Map<string, Valor[][]>>();
  const partesDeFila = new Map<string, string[]>();
  const etiquetasCol = new Set<string>();

  /** El tipo de cada columna, para no buscarlo dentro del bucle de las filas. */
  const tipoDe = new Map(columnasOrigen.map((c) => [c.clave, c.tipo]));

  for (const fila of origen.filas) {
    const partes = dimFilas.map((d) => etiqueta(fila[d], tipoDe.get(d)));
    /*
      La clave del grupo se serializa en vez de pegar las dos etiquetas con un
      separador. Cualquier separador que se eligiera podria aparecer dentro de
      un dato real —una zona se llama "Ruitoque Alto", un embudo lleva guiones—
      y dos grupos distintos acabarian sumandose en el mismo.
    */
    const claveFila = JSON.stringify(partes);
    const claveCol = dimCol ? etiqueta(fila[dimCol], tipoDe.get(dimCol)) : '';
    if (dimCol) etiquetasCol.add(claveCol);

    if (!partesDeFila.has(claveFila)) partesDeFila.set(claveFila, partes);
    let porCol = grupos.get(claveFila);
    if (!porCol) grupos.set(claveFila, (porCol = new Map()));
    let celdas = porCol.get(claveCol);
    if (!celdas) porCol.set(claveCol, (celdas = medidas.map(() => [])));

    medidas.forEach((medida, i) => {
      // En `cuenta` se apunta la fila entera aunque el campo este vacio: lo que
      // se cuenta son inmuebles o clientes, no celdas rellenas.
      if (medida.agregado === 'cuenta') celdas[i].push(1);
      else celdas[i].push(fila[medida.campo] ?? null);
    });
  }

  const cabecerasCol = dimCol ? ordenar([...etiquetasCol]) : [''];

  /** La clave de una celda de resultado. Lleva columna y medida para no chocar. */
  const claveCelda = (ci: number, mi: number) => (dimCol ? `c${ci}_m${mi}` : `m${mi}`);

  const columnas: Columna[] = dimFilas.map((clave) => {
    const col = columnasOrigen.find((c) => c.clave === clave);
    const rotulo = col?.rotulo ?? clave;
    // Se dice que se agrupo por mes: una columna "Fecha de alta" con "2026-03"
    // dentro invita a pensar que falta el dia.
    return {
      clave,
      rotulo: col?.tipo === 'fecha' ? `${rotulo} (mes)` : rotulo,
      tipo: 'texto' as const,
    };
  });

  cabecerasCol.forEach((cab, ci) => {
    medidas.forEach((medida, mi) => {
      const tipoOrigen = columnasOrigen.find((c) => c.clave === medida.campo)?.tipo;
      const base = rotuloMedida(medida, columnasOrigen);
      columnas.push({
        clave: claveCelda(ci, mi),
        rotulo: dimCol ? `${cab} - ${base}` : base,
        tipo: tipoResultado(medida.agregado, tipoOrigen),
      });
    });
  });

  const filas: Fila[] = [];
  for (const claveFila of ordenar([...partesDeFila.keys()])) {
    const partes = partesDeFila.get(claveFila) ?? [];
    const fila: Fila = {};
    dimFilas.forEach((clave, i) => {
      fila[clave] = partes[i] ?? SIN_VALOR;
    });

    const porCol = grupos.get(claveFila);
    cabecerasCol.forEach((cab, ci) => {
      const celdas = porCol?.get(cab);
      medidas.forEach((medida, mi) => {
        // Un cruce que no existe se deja vacio, no en cero: "no hay bodegas en
        // Giron" no es lo mismo que "hay cero pesos en bodegas de Giron".
        fila[claveCelda(ci, mi)] = celdas ? agregar(medida.agregado, celdas[mi]) : null;
      });
    });

    filas.push(fila);
  }

  const nombreDim = dimFilas
    .map((d) => columnasOrigen.find((c) => c.clave === d)?.rotulo ?? d)
    .join(' y ');

  return {
    conjunto: {
      clave: `dinamica:${def.origen}`,
      titulo: nombreDim ? `${origen.titulo} por ${nombreDim.toLowerCase()}` : origen.titulo,
      columnas,
      filas,
    },
    filasOrigen: origen.filas.length,
  };
}

/**
 * Las columnas que sirven para agrupar.
 *
 * Fuera el dinero: cada inmueble tiene un precio distinto, asi que agrupar por
 * el devolveria una fila por inmueble y ninguna informacion. Fuera por lo mismo
 * los identificadores, que ademas darian un resultado ilegible — la hoja de
 * inmuebles trae un `Id` que solo esta ahi para cruzarla con relaciones y
 * citas. Cuales son lo dice la API con el tipo `identificador`, no una lista de
 * nombres nuestra: asi el dia que aparezca una hoja nueva sus claves ya vienen
 * marcadas y aqui no hay que acordarse de nada. Las fechas si entran, porque se
 * agrupan por mes.
 */
export function dimensionesPosibles(conjunto: Conjunto): Columna[] {
  return conjunto.columnas.filter(
    (c) => c.tipo === 'texto' || c.tipo === 'si-no' || c.tipo === 'fecha',
  );
}

/** Las columnas sobre las que tiene sentido hacer cuentas. */
export function medidasPosibles(conjunto: Conjunto): Columna[] {
  return conjunto.columnas.filter((c) => c.tipo === 'numero' || c.tipo === 'dinero');
}
