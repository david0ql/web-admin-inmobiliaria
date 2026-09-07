import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { createUniver, LocaleType, merge, type FUniver } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEsES from '@univerjs/preset-sheets-core/locales/es-ES';

import '@univerjs/preset-sheets-core/lib/index.css';

import type { CeldasPropias } from '@/lib/hojas/almacen';
import { nombreEnCastellano, type NombreEnCastellano } from '@/lib/hojas/formulas-es';
import { celdasPropias, construirHoja, estilos } from '@/lib/hojas/libro';
import type { IStyleData, Nullable } from '@univerjs/presets';
import type { Conjunto } from '@/lib/hojas/tipos';

/**
 * El libro de Univer.
 *
 * Todo lo pesado de la pantalla esta aqui dentro, y este fichero solo se
 * importa con `lazy()`: Univer y su hoja de estilos son casi dos megas, y quien
 * nunca abre esta pantalla —que es casi todo el mundo casi todos los dias— no
 * tiene por que descargarlos.
 *
 * El montaje es imperativo y vive fuera de React a proposito. Univer se pinta
 * sobre un canvas y se gobierna con su propia fachada; envolverlo en estado de
 * React solo consigue que cada tecleo en una celda repinte el arbol entero.
 * React pone el hueco y el ciclo de vida, nada mas.
 */

/** Lo que la pantalla puede pedirle al libro ya montado. */
export interface LibroApi {
  /** Las celdas que ha escrito la persona en cada hoja, para guardarlas. */
  celdasDeCadaHoja: () => Record<string, CeldasPropias>;
}

interface Props {
  /**
   * Las hojas a pintar. Cambiar este array REHACE el libro entero: no es una
   * lista reactiva, es la instantanea con la que se construye.
   */
  hojas: { id: string; nombre: string; conjunto: Conjunto }[];
  /** Lo que la persona tenia escrito, por hoja. */
  propias: Record<string, CeldasPropias>;
  /** Se llama cuando algo cambia en el libro, para que la pantalla lo guarde. */
  onCambio?: () => void;
  /**
   * Se llama cuando alguien escribe una funcion con su nombre en castellano.
   *
   * Univer solo entiende los nombres en ingles, asi que esa formula va a dar
   * `#NAME?`. Se avisa en el momento de escribirla y no despues, porque es
   * cuando la persona todavia se acuerda de lo que queria hacer.
   */
  onNombreEnCastellano?: (aviso: NombreEnCastellano) => void;
  ref?: Ref<LibroApi>;
}

/** El identificador del libro. Uno solo: aqui no hay varios abiertos a la vez. */
const UNIDAD = 'serrano-hojas';

export function Libro({ hojas, propias, onCambio, onNombreEnCastellano, ref }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  /*
    La fachada de Univer y el tamano del bloque de datos de cada hoja. Van en
    refs y no en estado porque los lee el efecto de limpieza y el `ref`
    imperativo, no el pintado: meterlos en estado provocaria un ciclo de
    remontado con cada tecla.
  */
  const api = useRef<FUniver | null>(null);
  const medidas = useRef<Record<string, { filas: number; columnas: number }>>({});

  useImperativeHandle(ref, () => ({
    celdasDeCadaHoja() {
      const univerAPI = api.current;
      if (!univerAPI) return {};

      const libro = univerAPI.getActiveWorkbook();
      const guardado = libro?.save() as InstantaneaLibro | undefined;
      if (!guardado?.sheets) return {};

      const salida: Record<string, CeldasPropias> = {};
      for (const [id, hoja] of Object.entries(guardado.sheets)) {
        const medida = medidas.current[id];
        if (!medida) continue;
        salida[id] = celdasPropias(hoja?.cellData, medida.filas, medida.columnas);
      }
      return salida;
    },
  }));

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    /*
      Univer se monta sobre un hueco propio, creado aqui y no sobre el div de
      React. Son dos duenos distintos del mismo nodo: Univer pinta y destruye
      por su cuenta, y React reconcilia. Dandole el suyo, al desmontar basta con
      arrancar ese hueco entero — y el remontado de `StrictMode` estrena uno
      limpio en vez de pelearse con los restos del anterior.
    */
    const hueco = document.createElement('div');
    hueco.style.height = '100%';
    nodo.append(hueco);

    const construidas = hojas.map((h) => construirHoja(h.id, h.nombre, h.conjunto, propias[h.id]));
    medidas.current = Object.fromEntries(
      construidas.map((h) => [h.id, { filas: h.filasDatos, columnas: h.columnasDatos }]),
    );

    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ES_ES,
      locales: {
        // Univer trae su interfaz traducida al castellano; se carga la suya en
        // vez de dejar la inglesa por defecto, que es lo que hace la mitad de
        // las integraciones y luego se ve "Insert" encima de una hoja en
        // espanol.
        [LocaleType.ES_ES]: merge({}, UniverPresetSheetsCoreEsES),
      },
      presets: [
        UniverSheetsCorePreset({
          container: hueco,
          /*
            Sin worker. Univer puede llevarse el calculo de formulas a un hilo
            aparte, pero eso obliga a publicar un fichero suelto y a servirlo
            desde una ruta fija — y con 642 inmuebles y 7.532 clientes el
            calculo en el hilo principal ni se nota. Si algun dia el inventario
            crece un orden de magnitud, esto es lo primero que hay que revisar.
          */
          formulaBar: true,
        }),
      ],
    });

    univerAPI.createWorkbook({
      id: UNIDAD,
      name: 'Serrano',
      locale: LocaleType.ES_ES,
      styles: estilos() as Record<string, Nullable<IStyleData>>,
      sheetOrder: construidas.map((h) => h.id),
      sheets: Object.fromEntries(construidas.map((h) => [h.id, h.datos])),
    });

    /*
      Un solo aviso por edicion, sin datos dentro: la pantalla lo unico que hace
      con el es marcar que hay algo que guardar. Pasarle la celda seria mandarle
      un dato del CRM a un `setState`, que es justo lo que no debe salir de
      aqui.
    */
    api.current = univerAPI;

    /*
      Un solo oyente para las dos cosas que la pantalla necesita saber de una
      edicion: que hay algo que guardar, y si lo que se acaba de escribir usa
      una funcion con su nombre en castellano. Se mira la formula que se tecleo,
      sin esperar a que el motor devuelva `#NAME?`: si el nombre esta en
      castellano el error es seguro, y avisar antes ahorra el susto.
    */
    const suscripcion = univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params) => {
      onCambio?.();
      if (!onNombreEnCastellano) return;

      /*
        Se miran SOLO los rangos que el evento dice que han cambiado, no el
        libro entero: `save()` serializa las cinco hojas con sus 10.000 filas y
        hacerlo en cada edicion se notaria al teclear. Aqui son una o dos celdas.
      */
      for (const rango of params.effectedRanges ?? []) {
        for (const fila of rango.getFormulas()) {
          for (const formula of fila) {
            if (!formula) continue;
            const aviso = nombreEnCastellano(formula);
            if (aviso) {
              onNombreEnCastellano(aviso);
              return;
            }
          }
        }
      }
    });

    return () => {
      /*
        Desmontar de verdad. En `StrictMode` React monta, desmonta y vuelve a
        montar cada efecto, asi que una limpieza a medias deja dos instancias de
        Univer peleandose por el mismo sitio — se ve como una hoja en blanco
        encima de la buena.

        El orden importa. Primero se arranca el hueco del arbol, que es lo que
        hace desaparecer el lienzo al instante. El `dispose()` va DESPUES y en
        un temporizador a cero: por dentro Univer desmonta su propio arbol de
        React de forma sincrona, y hacerlo aqui mismo cae en mitad del renderizado
        del nuestro — React lo avisa por consola («Attempted to synchronously
        unmount a root while React was already rendering») y advierte de que
        puede acabar en una condicion de carrera. Aplazarlo un turno deja que el
        renderizado termine antes.
      */
      suscripcion?.dispose();
      api.current = null;
      hueco.remove();
      setTimeout(() => univer.dispose(), 0);
    };
    /*
      `propias` y `onCambio` se leen en el montaje y a proposito NO disparan uno
      nuevo: rehacer el libro con cada tecleo perderia la seleccion, el scroll y
      la celda a medio escribir.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hojas]);

  return (
    <div
      ref={contenedor}
      // Univer mide su canvas contra el alto del contenedor: sin una altura
      // concreta se pinta de cero pixeles y la pantalla sale vacia.
      className="h-full w-full min-h-0"
      data-univer
    />
  );
}

// --- lo justo de la fachada de Univer para no tirar de `any` ---------------

interface InstantaneaLibro {
  sheets?: Record<string, { cellData?: Record<string, Record<string, { v?: unknown; f?: unknown }>> } | undefined>;
}

