import type { Cell, Sheet } from 'write-excel-file/browser';

import type { Conjunto, TipoColumna, Valor } from './tipos';

/*
  El tipo con el que la libreria parametriza sus hojas: lo que en el navegador
  puede llegar a ser el contenido de un fichero incrustado. No lo exporta por
  una ruta publica, asi que se repite aqui — solo hace falta para nombrar el
  generico, y no se incrusta ningun fichero.
*/
type ContenidoDeFichero = File | Blob | ArrayBuffer;

/**
 * La descarga en XLSX.
 *
 * Es lo primero que pide quien ve una hoja, y el exportador de Univer esta en
 * la edicion de pago. Se usa `write-excel-file` (MIT, y su unica dependencia
 * `fflate` tambien): solo escribe, que es lo que hace falta aqui, y son 1,8 MB
 * de paquete frente a los 21 MB de ExcelJS. Se descarta `xlsx` de SheetJS
 * porque la unica version que queda en npm (0.18.5) arrastra avisos de
 * seguridad abiertos y las nuevas ya no se publican alli.
 *
 * La libreria se carga al pulsar el boton, no al abrir la pantalla: quien mira
 * una hoja y no la descarga no tiene por que bajarse un escritor de zip.
 */

/** El formato de numero que viaja en el fichero, en notacion de Excel. */
const FORMATO: Partial<Record<TipoColumna, string>> = {
  // Solo el dinero, y sin decimales: el inventario esta en pesos y nadie
  // escribe centavos en una consignacion de 430 millones. Al resto de numeros
  // se les deja el general de Excel, igual que en la hoja del panel.
  dinero: '"$"#,##0',
};

function celda(valor: Valor, tipo: TipoColumna): Cell {
  if (valor === null || valor === undefined || valor === '') return null;

  if (tipo === 'si-no' || typeof valor === 'boolean') {
    return { type: String, value: valor ? 'Sí' : 'No' };
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    /*
      Numero de verdad, con su formato al lado. Las dos cosas importan: si el
      precio saliera como el texto "$ 430.000.000" no habria SUMA que valiera, y
      si saliera como un numero pelado habria que darle formato a mano cada vez
      —lo que a la tercera nadie hace—.
    */
    return { type: Number, value: valor, format: FORMATO[tipo] };
  }

  return { type: String, value: String(valor) };
}

/** Nombre de hoja que Excel acepta: sin `:\/?*[]` y de 31 caracteres a lo sumo. */
function nombreDeHoja(titulo: string, usados: Set<string>): string {
  const limpio = titulo.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja';
  if (!usados.has(limpio)) {
    usados.add(limpio);
    return limpio;
  }
  // Excel rechaza el fichero ENTERO si dos hojas se llaman igual, asi que se
  // desempata aqui en vez de dejar que reviente al abrirlo.
  for (let i = 2; ; i++) {
    const sufijo = ` (${i})`;
    const candidato = limpio.slice(0, 31 - sufijo.length) + sufijo;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }
}

/**
 * Escribe un libro con una hoja por conjunto y lo descarga.
 *
 * Se exportan VALORES, no formulas. Es deliberado: las formulas que escribio la
 * persona apuntan a las celdas de ESTA disposicion, y quien recibe el fichero
 * quiere las cifras, no una hoja que le pide recalcular. Lo que se ve en el
 * panel es lo que se abre en Excel.
 */
export async function descargarXlsx(conjuntos: Conjunto[], fichero: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const usados = new Set<string>();
  const hojas: Sheet<ContenidoDeFichero>[] = conjuntos.map((c) => ({
    sheet: nombreDeHoja(c.titulo, usados),
    columns: c.columnas.map((col) => ({ width: col.tipo === 'texto' ? 30 : 16 })),
    data: [
      c.columnas.map<Cell>((col) => ({
        value: col.rotulo,
        type: String,
        fontWeight: 'bold',
        backgroundColor: '#f1f5f9',
      })),
      ...c.filas.map((fila) => c.columnas.map((col) => celda(fila[col.clave], col.tipo))),
    ],
  }));

  await writeXlsxFile(hojas, {}).toFile(fichero);
}

/** `Inmuebles-2026-09-06.xlsx`: el nombre con el que se guarda. */
export function nombreFichero(titulo: string): string {
  const hoy = new Date();
  const fecha = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
  const limpio = titulo.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${limpio || 'hojas'}-${fecha}.xlsx`;
}
