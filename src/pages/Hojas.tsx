import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, Table2, Trash2 } from 'lucide-react';

import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBranch } from '../lib/branch';
import { dateTime, number as numero } from '../lib/format';
import * as almacen from '../lib/hojas/almacen';
import { cargar, catalogo, type Ficha } from '../lib/hojas/datos';
import { calcular, dimensionesPosibles, medidasPosibles } from '../lib/hojas/dinamica';
import { descargarXlsx, nombreFichero } from '../lib/hojas/exportar';
import type { NombreEnCastellano } from '../lib/hojas/formulas-es';
import {
  AGREGADO_ROTULO,
  type Agregado,
  type Conjunto,
  type Dinamica,
  type HojaGuardada,
} from '../lib/hojas/tipos';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Button,
  Card,
  ErrorNote,
  PageBody,
  SELECT_CLASS,
  Skeleton,
} from '../components/ui';
import type { LibroApi } from '../components/hojas/Libro';

/*
  Univer con su hoja de estilos pesa mas que el resto del panel junto. Se carga
  aqui y solo aqui: quien no abre esta pantalla —que es casi todo el mundo casi
  todos los dias— no se descarga ni un byte.
*/
const Libro = lazy(() =>
  import('../components/hojas/Libro').then((m) => ({ default: m.Libro })),
);

/** Como va la carga de una hoja. */
interface Estado {
  cargando: boolean;
  traidas: number;
  total: number;
  error: string | null;
  recortado: boolean;
}

const ESTADO_INICIAL: Estado = {
  cargando: true,
  traidas: 0,
  total: 0,
  error: null,
  recortado: false,
};

/**
 * Hojas: el CRM como una hoja de calculo.
 *
 * Toda la agencia trabaja en tablas —el inventario, el clientario, quien ha
 * visto que— y hasta ahora cada pregunta que no cupiera en una pantalla del
 * panel acababa en un Excel exportado a mano. Esto es ese Excel, pero con los
 * datos de hoy.
 *
 * La pantalla es VOLATIL y lo dice: nada de lo que se escriba aqui vuelve al
 * CRM. Lo unico que sobrevive a la recarga es la receta —que hojas hay, que
 * dinamicas, que formulas— y jamas las cifras, que se vuelven a pedir siempre.
 */
export function Hojas() {
  const { user } = useAuth();
  const { current, seesAll } = useBranch();

  /*
    Que hojas hay lo dice la API, no el panel. Asi anadir una hoja nueva al CRM
    no obliga a tocar esta pantalla, y sobre todo: los totales que se enseñan
    son los que esa persona puede ver, contados con la misma consulta que sirve
    las filas.
  */
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [datos, setDatos] = useState<Record<string, Conjunto>>({});
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [traidoEl, setTraidoEl] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [montadas, setMontadas] = useState<HojaGuardada[]>(() => almacen.leer().hojas);
  const propias = useRef(almacen.leer().celdas);
  const libro = useRef<LibroApi>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExporte, setErrorExporte] = useState<string | null>(null);
  /*
    El ultimo nombre de funcion en castellano que alguien ha escrito. Se guarda
    uno solo: si sigue escribiendo formulas en castellano es el mismo aviso, y
    apilarlos empujaria la hoja hacia abajo justo mientras trabaja.
  */
  const [enCastellano, setEnCastellano] = useState<NombreEnCastellano | null>(null);

  // --- traer los datos -----------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    let vivo = true;

    setErrorCatalogo(null);

    (async () => {
      let disponibles: Ficha[];
      try {
        disponibles = await catalogo(controller.signal);
      } catch (error) {
        if (!vivo || controller.signal.aborted) return;
        setErrorCatalogo(mensaje(error, 'No se pudo saber qué hojas hay.'));
        return;
      }
      if (!vivo) return;

      setFichas(disponibles);
      setEstados(Object.fromEntries(disponibles.map((f) => [f.nombre, ESTADO_INICIAL])));

      /*
        Las hojas se traen una detras de otra, no a la vez. Son consultas contra
        la base de produccion de la agencia con sus joins y sus cuentas;
        lanzarlas en paralelo es la forma mas rapida de que el servidor se
        atragante mientras alguien esta atendiendo a un cliente.
      */
      for (const ficha of disponibles) {
        try {
          const traido = await cargar(ficha, controller.signal, (traidas, total) => {
            if (!vivo) return;
            setEstados((prev) => ({
              ...prev,
              [ficha.nombre]: { ...prev[ficha.nombre], traidas, total },
            }));
          });
          if (!vivo) return;
          setDatos((prev) => ({ ...prev, [ficha.nombre]: traido.conjunto }));
          setEstados((prev) => ({
            ...prev,
            [ficha.nombre]: {
              ...prev[ficha.nombre],
              cargando: false,
              recortado: traido.recortado,
            },
          }));
          if (traido.generadoEl) setTraidoEl(traido.generadoEl);
        } catch (error) {
          if (!vivo || controller.signal.aborted) return;
          // Una hoja que falla no se lleva por delante a las demas: es mejor un
          // libro con cuatro pestañas y un aviso que una pantalla en blanco.
          setEstados((prev) => ({
            ...prev,
            [ficha.nombre]: {
              ...prev[ficha.nombre],
              cargando: false,
              error: mensaje(error, 'No se pudo traer esta hoja.'),
            },
          }));
        }
      }
    })();

    return () => {
      vivo = false;
      controller.abort();
    };
  }, [nonce]);

  const cargando =
    !errorCatalogo && (fichas.length === 0 || fichas.some((f) => estados[f.nombre]?.cargando));

  // --- las hojas del libro -------------------------------------------------

  /**
   * Lo que se le pasa a Univer.
   *
   * Las de origen van primero y siempre; detras, las que monto la persona. Una
   * hoja guardada cuyo origen fallo se queda fuera en silencio hasta que ese
   * origen vuelva: seria peor pintarla vacia.
   */
  const hojas = useMemo(() => {
    const base = fichas
      .filter((f) => datos[f.nombre])
      .map((f) => ({ id: f.nombre, nombre: recortar(f.titulo), conjunto: datos[f.nombre] }));

    const calculadas = montadas.flatMap((h) => {
      const fuente = datos[h.origen];
      if (!fuente) return [];
      const conjunto = h.dinamica ? calcular(fuente, h.dinamica).conjunto : fuente;
      return [{ id: h.id, nombre: h.nombre, conjunto: { ...conjunto, titulo: h.nombre } }];
    });

    return [...base, ...calculadas];
    /*
      El filtrado va AQUI DENTRO a proposito: calculado fuera seria un array
      nuevo en cada pintado, este `useMemo` no memorizaria nada y el libro de
      Univer se desmontaria y volveria a montar con cada tecla.
    */
  }, [fichas, datos, montadas]);

  /** Guarda la receta: las hojas montadas y lo que la persona haya escrito. */
  const guardar = useCallback(
    (siguientes: HojaGuardada[]) => {
      const celdas = { ...propias.current, ...(libro.current?.celdasDeCadaHoja() ?? {}) };
      propias.current = celdas;
      almacen.escribir({ hojas: siguientes, celdas });
    },
    [],
  );

  /*
    Al salir de la pantalla se guarda lo escrito: nadie pulsa un boton de
    guardar en algo que se le ha presentado como volatil.

    La lista se lee de un ref y el efecto no depende de ella. Si dependiera,
    su limpieza correria con cada cambio y guardaria la lista ANTERIOR encima de
    la que se acaba de anadir — la hoja recien creada se perderia al recargar.
  */
  const ultimas = useRef(montadas);
  ultimas.current = montadas;
  useEffect(() => () => guardar(ultimas.current), [guardar]);

  const anadirHoja = useCallback(
    (hoja: HojaGuardada) => {
      setMontadas((prev) => {
        const siguientes = [...prev, hoja];
        guardar(siguientes);
        return siguientes;
      });
    },
    [guardar],
  );

  const quitarHoja = useCallback(
    (id: string) => {
      setMontadas((prev) => {
        const siguientes = prev.filter((h) => h.id !== id);
        delete propias.current[id];
        guardar(siguientes);
        return siguientes;
      });
    },
    [guardar],
  );

  // --- exportar ------------------------------------------------------------

  const exportar = useCallback(async () => {
    setExportando(true);
    setErrorExporte(null);
    try {
      await descargarXlsx(
        hojas.map((h) => h.conjunto),
        nombreFichero('Serrano-hojas'),
      );
    } catch {
      setErrorExporte('No se pudo generar el archivo. Vuelve a intentarlo.');
    } finally {
      setExportando(false);
    }
  }, [hojas]);

  const filasTotales = hojas.reduce((n, h) => n + h.conjunto.filas.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Análisis"
        title="Hojas"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)} disabled={cargando}>
              <RefreshCw className={cargando ? 'animate-spin' : undefined} />
              Actualizar datos
            </Button>
            <Button size="sm" onClick={() => void exportar()} disabled={cargando || exportando || hojas.length === 0}>
              {exportando ? <Loader2 className="animate-spin" /> : <Download />}
              Exportar a Excel
            </Button>
          </>
        }
      />

      <PageBody className="min-h-0 pb-6">
        <Aviso seesAll={seesAll} sede={current?.name ?? null} rol={user?.role ?? null} />

        <Procedencia
          cargando={cargando}
          traidoEl={traidoEl}
          fichas={fichas}
          estados={estados}
          filas={filasTotales}
        />

        {errorCatalogo && (
          <ErrorNote onRetry={() => setNonce((n) => n + 1)}>{errorCatalogo}</ErrorNote>
        )}

        {fichas
          .filter((f) => estados[f.nombre]?.error)
          .map((f) => (
            <ErrorNote key={f.nombre} onRetry={() => setNonce((n) => n + 1)}>
              <strong>{f.titulo}:</strong> {estados[f.nombre].error}
            </ErrorNote>
          ))}

        {fichas
          .filter((f) => estados[f.nombre]?.recortado)
          .map((f) => (
            <Alert key={f.nombre} tone="warn">
              <strong>{f.titulo}</strong> se cortó al llegar al tope de páginas: la hoja
              no trae el listado completo. Avísale a sistemas.
            </Alert>
          ))}

        {errorExporte && <ErrorNote>{errorExporte}</ErrorNote>}

        {enCastellano && (
          <Alert
            tone="warn"
            action={
              <Button variant="outline" size="sm" onClick={() => setEnCastellano(null)}>
                Entendido
              </Button>
            }
          >
            Escribiste <code>{enCastellano.escrito}</code> y aquí esa función se llama{' '}
            <code>{enCastellano.ingles}</code>. Los nombres van en inglés aunque el resto
            esté en español; con el nombre en castellano la celda queda en{' '}
            <code>#NAME?</code>.
          </Alert>
        )}

        <Dinamicas
          origenes={fichas
            .filter((f) => datos[f.nombre])
            .map((f) => ({ clave: f.nombre, titulo: f.titulo }))}
          datos={datos}
          montadas={montadas}
          onAnadir={anadirHoja}
          onQuitar={quitarHoja}
        />

        {/*
          Aqui no vale el `Card` del panel: envuelve a sus hijos en un div
          propio que no estira, y Univer mide su canvas contra la altura del
          contenedor — dentro de una tarjeta se pintaria de cero pixeles.
        */}
        <div className="flex min-h-[600px] flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          {cargando ? (
            <div className="flex flex-1 flex-col gap-2 p-4" aria-busy="true">
              <Skeleton className="h-9 w-full" />
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : hojas.length === 0 ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
              No hay ninguna hoja que mostrar.
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="grid flex-1 place-items-center gap-2 p-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <span className="note">Cargando la hoja de cálculo…</span>
                </div>
              }
            >
              <div className="min-h-0 flex-1">
                <Libro
                  ref={libro}
                  hojas={hojas}
                  propias={propias.current}
                  onNombreEnCastellano={setEnCastellano}
                />
              </div>
            </Suspense>
          )}
        </div>
      </PageBody>
    </>
  );
}

/**
 * Por que ves lo que ves.
 *
 * Un coordinador abre esta pantalla y cuenta 180 inmuebles donde la agencia
 * tiene 642. Sin este parrafo, la conclusion natural es que la herramienta esta
 * rota — asi que se dice de quien es el recorte y por que, con el nombre de la
 * sede delante.
 */
function Aviso({
  seesAll,
  sede,
  rol,
}: {
  seesAll: boolean;
  sede: string | null;
  rol: string | null;
}) {
  return (
    <Alert tone="ok" className="border-secondary bg-secondary/40 text-foreground">
      <span>
        Esto es una hoja de cálculo <strong>de usar y tirar</strong>: escribe fórmulas,
        añade columnas y monta consolidados sin miedo, porque nada de lo que hagas aquí
        toca el CRM. Al recargar se conservan tus hojas y tus fórmulas, pero los datos se
        vuelven a pedir.{' '}
        {/*
          Se dice con todas las letras porque es LO PRIMERO con lo que se topa
          quien viene de Excel en español: `=SUMA(...)` devuelve `#NAME?`. El
          motor de Univer solo conoce los nombres en inglés — su traducción al
          castellano llega a los menús y a las descripciones, no a los nombres
          de función— y sin este aviso la conclusión es que la hoja está rota.
        */}
        Eso sí: las funciones van con su <strong>nombre en inglés</strong> —
        <code>SUM</code>, <code>AVERAGE</code>, <code>COUNTIF</code>,{' '}
        <code>VLOOKUP</code>—, no <code>SUMA</code> ni <code>PROMEDIO</code>.
        {!seesAll && (
          <>
            {' '}
            Como {rol === 'AGENT' ? 'asesor' : 'coordinador'}
            {sede ? ` de ${sede}` : ''}, estas hojas traen{' '}
            <strong>solo lo que te corresponde</strong>, no el total de la agencia.
          </>
        )}
      </span>
    </Alert>
  );
}

/** De cuando son los datos y cuantos son. */
function Procedencia({
  cargando,
  traidoEl,
  fichas,
  estados,
  filas,
}: {
  cargando: boolean;
  traidoEl: string | null;
  fichas: Ficha[];
  estados: Record<string, Estado>;
  filas: number;
}) {
  if (cargando) {
    const enCurso = fichas.find((f) => estados[f.nombre]?.cargando);
    const estado = enCurso ? estados[enCurso.nombre] : null;
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {enCurso ? `Trayendo ${enCurso.titulo.toLowerCase()}` : 'Mirando qué hojas hay'}
        {estado && estado.total > 0
          ? ` — ${numero(estado.traidas)} de ${numero(estado.total)}`
          : '…'}
      </p>
    );
  }

  return (
    <p className="note">
      {numero(filas)} filas en total · Datos del servidor a las{' '}
      {traidoEl ? dateTime(traidoEl) : '—'}
    </p>
  );
}

// --- el montador de dinamicas ---------------------------------------------

/**
 * La tabla dinamica, montada a mano.
 *
 * La de Univer esta en la edicion de pago y esa edicion ni siquiera se puede
 * comprar ahora mismo, asi que el motor es nuestro (`lib/hojas/dinamica.ts`) y
 * esto es su formulario: agrupa por una o dos columnas, opcionalmente abre una
 * tercera en columnas, y agrega. El resultado cae en una hoja nueva como
 * VALORES, para que encima se le puedan seguir escribiendo formulas.
 */
function Dinamicas({
  origenes,
  datos,
  montadas,
  onAnadir,
  onQuitar,
}: {
  origenes: { clave: string; titulo: string }[];
  datos: Record<string, Conjunto>;
  montadas: HojaGuardada[];
  onAnadir: (hoja: HojaGuardada) => void;
  onQuitar: (id: string) => void;
}) {
  const [origen, setOrigen] = useState('');
  const [fila1, setFila1] = useState('');
  const [fila2, setFila2] = useState('');
  const [columna, setColumna] = useState('');
  const [campo, setCampo] = useState('');
  const [agregado, setAgregado] = useState<Agregado>('cuenta');

  // Al cambiar de origen las columnas elegidas ya no existen: se limpian en vez
  // de dejar un formulario que apunta a campos de otra tabla.
  const elegirOrigen = (clave: string) => {
    setOrigen(clave);
    setFila1('');
    setFila2('');
    setColumna('');
    setCampo('');
  };

  const fuente = datos[origen];
  const dimensiones = fuente ? dimensionesPosibles(fuente) : [];
  const medidas = fuente ? medidasPosibles(fuente) : [];
  const listo = Boolean(fuente && fila1 && (agregado === 'cuenta' || campo));

  const crear = () => {
    if (!fuente || !fila1) return;
    const dinamica: Dinamica = {
      origen,
      filas: [fila1, fila2].filter(Boolean),
      columna: columna || null,
      medidas: [{ campo: agregado === 'cuenta' ? (campo || fila1) : campo, agregado }],
    };
    const previsto = calcular(fuente, dinamica).conjunto;
    onAnadir({
      id: `d-${Date.now().toString(36)}`,
      nombre: recortar(previsto.titulo),
      origen,
      dinamica,
    });
    setFila1('');
    setFila2('');
    setColumna('');
  };

  if (origenes.length === 0) return null;

  return (
    <Card
      title="Tabla dinámica"
      action={<span className="note">Agrupa y suma; el resultado va a una hoja nueva</span>}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Sobre">
          <select className={SELECT_CLASS} value={origen} onChange={(e) => elegirOrigen(e.target.value)}>
            <option value="">Elige una hoja…</option>
            {origenes.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.titulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Agrupar por">
          <select
            className={SELECT_CLASS}
            value={fila1}
            onChange={(e) => setFila1(e.target.value)}
            disabled={!fuente}
          >
            <option value="">Elige una columna…</option>
            {dimensiones.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Y por (opcional)">
          <select
            className={SELECT_CLASS}
            value={fila2}
            onChange={(e) => setFila2(e.target.value)}
            disabled={!fila1}
          >
            <option value="">—</option>
            {dimensiones
              .filter((c) => c.clave !== fila1)
              .map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.rotulo}
                </option>
              ))}
          </select>
        </Campo>

        <Campo rotulo="En columnas (opcional)">
          <select
            className={SELECT_CLASS}
            value={columna}
            onChange={(e) => setColumna(e.target.value)}
            disabled={!fila1}
          >
            <option value="">—</option>
            {dimensiones
              .filter((c) => c.clave !== fila1 && c.clave !== fila2)
              .map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.rotulo}
                </option>
              ))}
          </select>
        </Campo>

        <Campo rotulo="Calcular">
          <select
            className={SELECT_CLASS}
            value={agregado}
            onChange={(e) => setAgregado(e.target.value as Agregado)}
          >
            {(Object.keys(AGREGADO_ROTULO) as Agregado[]).map((a) => (
              <option key={a} value={a}>
                {a === 'cuenta' ? 'Cuántos hay' : AGREGADO_ROTULO[a]}
              </option>
            ))}
          </select>
        </Campo>

        {agregado !== 'cuenta' && (
          <Campo rotulo="De">
            <select
              className={SELECT_CLASS}
              value={campo}
              onChange={(e) => setCampo(e.target.value)}
              disabled={!fuente}
            >
              <option value="">Elige una columna…</option>
              {medidas.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Button size="sm" onClick={crear} disabled={!listo}>
          <Table2 />
          Crear hoja
        </Button>
      </div>

      {montadas.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {montadas.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-1.5 rounded-md border bg-secondary/40 py-1 pr-1 pl-2.5 text-sm"
            >
              <span className="truncate">{h.nombre}</span>
              <button
                type="button"
                onClick={() => onQuitar(h.id)}
                aria-label={`Quitar la hoja ${h.nombre}`}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-40 flex-col gap-1">
      <span className="micro-label text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

/** El texto de un error de la API, que ya viene escrito para el usuario. */
function mensaje(error: unknown, porDefecto: string): string {
  return error instanceof ApiError ? error.message : porDefecto;
}

/** Univer no admite nombres de hoja de cualquier largo, y 31 es lo que cabe. */
function recortar(nombre: string): string {
  return nombre.length <= 31 ? nombre : `${nombre.slice(0, 30)}…`;
}
