import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CircleAlert, LogIn, LogOut } from 'lucide-react';

import { api, type Agent } from '../lib/api';
import {
  accuracyLabel,
  addDays,
  bogotaToday,
  dayShort,
  daysBetween,
  duration,
  hasPoint,
  looseAccuracy,
  sessionKey,
  teamHistory,
  type TeamDay,
  type TeamHistory,
  type TeamMark,
  type TeamSession,
} from '../lib/attendance';
import { ROLE_LABEL, relative } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  PageBody,
  SELECT_CLASS,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';
import { cn } from '../lib/utils';

/*
  Leaflet son 150 kB que solo hacen falta aqui. Cargarlo aparte deja el resto
  del panel como estaba para quien nunca abre esta pantalla.
*/
const AttendanceMap = lazy(() =>
  import('../components/AttendanceMap').then((m) => ({ default: m.AttendanceMap })),
);

/** Una fila de la lista: una jornada, con el dia y la persona a los que va. */
interface Fila {
  key: string;
  date: string;
  agentName: string;
  branchName: string | null;
  session: TeamSession;
}

/**
 * Historia de asistencia: quien, cuando y desde donde.
 *
 * Esto se usa para pagar nominas y para tener conversaciones incomodas, asi que
 * la pantalla esta escrita con una regla por encima de las demas: no sugerir
 * nada que el dato no diga. De ahi que una jornada sin cerrar se lea "sigue
 * dentro" en vez de como una casilla vacia, que no se le calcule un total con
 * el reloj de ahora, y que la precision del GPS se enseñe cuando es tan mala
 * que el punto ya no situa a nadie.
 *
 * Las horas y las fechas se pintan tal y como llegan (`mark.time`, `mark.date`):
 * las calcula Postgres en `America/Bogota`, que es el mismo calculo con el que
 * la API agrupa los dias. Convertirlas otra vez aqui abriria la puerta a que
 * una marca se agrupe en un dia y se lea con la fecha de otro.
 *
 * Los filtros viven en la URL —`?desde=&hasta=&persona=&jornada=`— para que
 * "la semana pasada de Fulano" sea un enlace que se pega en un chat, que es
 * como se pasa de verdad esta informacion dentro de la agencia.
 */
export function AttendanceHistory() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();

  const hoy = bogotaToday();
  // Por defecto, la semana corrida: es el tramo con el que se revisa la
  // asistencia y evita abrir la pantalla pidiendo el historico entero.
  const desde = params.get('desde') || bogotaToday(-6);
  const hasta = params.get('hasta') || hoy;
  const persona = params.get('persona') ?? '';
  const elegida = params.get('jornada');

  const puedeVer = can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER');

  /** Cambia filtros conservando el resto de la URL. */
  const setFiltro = useCallback(
    (cambios: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [clave, valor] of Object.entries(cambios)) {
            if (valor) next.set(clave, valor);
            else next.delete(clave);
          }
          // La jornada elegida pertenece a la lista anterior: con otros filtros
          // puede no estar, y dejarla puesta señalaria a nada.
          next.delete('jornada');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const cambiarSeleccion = useCallback(
    (id: string, alternar: boolean) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (alternar && next.get('jornada') === id) next.delete('jornada');
          else next.set('jornada', id);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Pulsar una chincheta señala; volver a pulsar la fila ya elegida la
  // deselecciona, que es como se quita la marca sin buscar un boton.
  const senalar = useCallback(
    (id: string) => cambiarSeleccion(id, false),
    [cambiarSeleccion],
  );
  const alternar = useCallback(
    (id: string) => cambiarSeleccion(id, true),
    [cambiarSeleccion],
  );

  // El desplegable de personas sale de `/agents`, que la API ya acota por sede:
  // un coordinador solo puede elegir entre los suyos porque la API no le
  // devuelve a nadie mas, no porque el panel se lo esconda.
  const equipo = useFetch<Agent[]>(
    (signal) => api.get<Agent[]>('/agents', { includeInactive: true }, signal),
    [],
  );

  const historia = useFetch<TeamHistory>(
    (signal) =>
      teamHistory(
        { from: desde, to: hasta, agentId: persona || undefined },
        signal,
      ),
    [desde, hasta, persona],
  );

  const filas = useMemo(() => aplanar(historia.data?.days ?? []), [historia.data]);
  // Memorizado y no `?? []` al vuelo: un array nuevo en cada render volveria a
  // disparar el resumen y, con el, el redibujado del mapa.
  const totales = useMemo(() => historia.data?.agents ?? [], [historia.data]);

  const resumen = useMemo(() => {
    let minutos = 0;
    let abiertas = 0;
    for (const t of totales) {
      minutos += t.workedMinutes;
      abiertas += t.openSessions;
    }
    return { minutos, abiertas };
  }, [totales]);

  // Al mapa solo van las jornadas con algun punto. Es la misma lista para el
  // mapa y para el encuadre: lo que se ve es exactamente lo que hay filtrado.
  const enMapa = useMemo(
    () =>
      filas
        .filter((f) => hasPoint(f.session.checkIn) || hasPoint(f.session.checkOut))
        .map((f) => f.session),
    [filas],
  );

  // Elegir en el mapa tiene que mover la lista: si no, la fila de la jornada
  // que acabas de pulsar puede estar cien filas mas abajo.
  const nodos = useRef<Map<string, HTMLTableRowElement>>(new Map());
  useEffect(() => {
    if (!elegida) return;
    nodos.current.get(elegida)?.scrollIntoView({ block: 'nearest' });
  }, [elegida, filas]);

  if (!puedeVer) return <Navigate to="/" replace />;

  const dias = daysBetween(desde, hasta);

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Asistencia"
        actions={
          <span className="note">
            {dias > 0
              ? `${dias} ${dias === 1 ? 'día' : 'días'} · hora de Colombia`
              : 'Rango sin días'}
          </span>
        }
      />

      <PageBody>
        <Card title="Filtros" flush>
          <div className="flex flex-wrap items-end gap-4 p-5">
            <label className="grid content-start gap-1.5">
              <span className="micro-label text-muted-foreground">Desde</span>
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => setFiltro({ desde: e.target.value })}
                className={SELECT_CLASS}
              />
            </label>

            <label className="grid content-start gap-1.5">
              <span className="micro-label text-muted-foreground">Hasta</span>
              <input
                type="date"
                value={hasta}
                min={desde}
                onChange={(e) => setFiltro({ hasta: e.target.value })}
                className={SELECT_CLASS}
              />
            </label>

            <label className="grid min-w-56 flex-1 content-start gap-1.5">
              <span className="micro-label text-muted-foreground">Persona</span>
              <select
                value={persona}
                onChange={(e) => setFiltro({ persona: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">Todo el equipo</option>
                {(equipo.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName} {a.lastName ?? ''}
                    {a.status === 'ACTIVE' ? '' : ' (inactivo)'} ·{' '}
                    {ROLE_LABEL[a.role] ?? a.role}
                  </option>
                ))}
              </select>
            </label>

            {/* Los tramos que de verdad se piden: nadie teclea dos fechas para
                mirar lo de hoy. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Atajo label="Hoy" onClick={() => setFiltro({ desde: hoy, hasta: hoy })} />
              <Atajo
                label="7 días"
                onClick={() => setFiltro({ desde: addDays(hoy, -6), hasta: hoy })}
              />
              <Atajo
                label="30 días"
                onClick={() => setFiltro({ desde: addDays(hoy, -29), hasta: hoy })}
              />
              <Atajo
                label="Este mes"
                onClick={() => setFiltro({ desde: `${hoy.slice(0, 7)}-01`, hasta: hoy })}
              />
            </div>
          </div>
        </Card>

        {historia.error && (
          <ErrorNote onRetry={historia.reload}>{historia.error}</ErrorNote>
        )}
        {historia.loading && !historia.data && <Loading rows={6} />}

        {historia.data && (
          <>
            {/* Si la API corto por el tope, decirlo: una lista incompleta que se
                presenta como completa es peor que no enseñar nada. */}
            {historia.data.truncated && (
              <Alert tone="warn">
                El rango tiene más marcas de las que caben en una consulta. Lo que
                ves está recortado: acota las fechas o elige una persona.
              </Alert>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Jornadas" value={filas.length} note="en el rango elegido" />
              <Stat
                label="Personas"
                value={totales.length}
                note="con alguna marca"
              />
              <Stat
                label="Tiempo trabajado"
                value={duration(resumen.minutos)}
                note="solo jornadas cerradas"
              />
              <Stat
                label="Sin cerrar"
                value={resumen.abiertas}
                tone={resumen.abiertas ? 'amber' : 'neutral'}
                note={
                  resumen.abiertas
                    ? 'marcaron entrada y no salida'
                    : 'todas tienen entrada y salida'
                }
              />
            </div>

            <Card title="Dónde marcaron" action={<Leyenda />} flush>
              {enMapa.length === 0 ? (
                <div className="p-5">
                  <Empty title="Nada que situar en el mapa">
                    {filas.length
                      ? 'Hay jornadas en este rango, pero ninguna de sus marcas llegó con coordenadas.'
                      : 'No hay marcas en el rango de fechas y la persona elegidos.'}
                  </Empty>
                </div>
              ) : (
                <div className="h-[440px] w-full">
                  <Suspense fallback={<div className="size-full bg-secondary" />}>
                    <AttendanceMap
                      sessions={enMapa}
                      selectedId={elegida}
                      onSelect={senalar}
                    />
                  </Suspense>
                </div>
              )}
            </Card>

            {filas.length === 0 ? (
              <Empty title="Sin jornadas">
                Nadie marcó entre el {dayShort(desde)} y el {dayShort(hasta)} con los
                filtros puestos.
              </Empty>
            ) : (
              <>
                <Card title="Jornadas" flush>
                  <Table>
                    <THead>
                      <tr>
                        <Th>Persona</Th>
                        <Th>Día</Th>
                        <Th>Entrada</Th>
                        <Th>Salida</Th>
                        <Th num>Trabajado</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {filas.map((fila) => (
                        <Tr
                          key={fila.key}
                          ref={(el: HTMLTableRowElement | null) => {
                            if (el) nodos.current.set(fila.key, el);
                            else nodos.current.delete(fila.key);
                          }}
                          onClick={() => alternar(fila.key)}
                          aria-selected={fila.key === elegida}
                          className={cn(
                            fila.key === elegida && 'bg-secondary hover:bg-secondary',
                          )}
                        >
                          <Td>
                            <strong className="font-medium">{fila.agentName}</strong>
                            {fila.branchName && (
                              <div className="note mt-0.5">{fila.branchName}</div>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap">{dayShort(fila.date)}</Td>
                          <Td>
                            {fila.session.checkIn ? (
                              <Marca
                                mark={fila.session.checkIn}
                                tipo="entrada"
                                dia={fila.date}
                              />
                            ) : (
                              // Una salida sin su entrada no es un error de la
                              // persona: la entrada quedo fuera del rango. Se
                              // dice, en vez de dejar la celda muda.
                              <span className="flex flex-col gap-1">
                                <Badge tone="amber">Sin entrada</Badge>
                                <span className="note">
                                  entró antes del rango consultado
                                </span>
                              </span>
                            )}
                          </Td>
                          <Td>
                            {fila.session.checkOut ? (
                              <Marca
                                mark={fila.session.checkOut}
                                tipo="salida"
                                dia={fila.date}
                              />
                            ) : (
                              <span className="flex flex-col gap-1">
                                <Badge tone="blue">Sigue dentro</Badge>
                                {fila.session.checkIn && (
                                  <span className="note">
                                    entró {relative(fila.session.checkIn.at)}
                                  </span>
                                )}
                              </span>
                            )}
                          </Td>
                          <Td num className="whitespace-nowrap">
                            {fila.session.minutes === null ? (
                              // Sin las dos puntas no hay total: contar desde la
                              // entrada hasta ahora seria dar por trabajado un
                              // rato que nadie ha declarado.
                              <span className="note">
                                {fila.session.open ? 'en curso' : 'sin calcular'}
                              </span>
                            ) : (
                              duration(fila.session.minutes)
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </Card>

                {/* El consolidado por persona lo hace la API sobre el rango
                    entero, asi que es la cifra que se puede llevar a una nomina
                    —no una suma hecha a ojo sobre la tabla de arriba—. */}
                <Card title="Por persona" flush>
                  <Table>
                    <THead>
                      <tr>
                        <Th>Persona</Th>
                        <Th hideSm>Sede</Th>
                        <Th num>Días con marcas</Th>
                        <Th num>Trabajado</Th>
                        <Th num>Sin cerrar</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {totales.map((t) => (
                        <Tr key={t.agentId}>
                          <Td>
                            <strong className="font-medium">{t.agentName}</strong>
                          </Td>
                          <Td hideSm className="note">
                            {t.branchName ?? 'Sin sede'}
                          </Td>
                          <Td num>{t.days}</Td>
                          <Td num>{duration(t.workedMinutes)}</Td>
                          <Td num>
                            {t.openSessions ? (
                              <Badge tone="amber">{t.openSessions}</Badge>
                            ) : (
                              '—'
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * De dias a filas.
 *
 * La API devuelve los dias ordenados del mas reciente al mas antiguo y, dentro
 * de cada uno, las jornadas en el orden en que ocurrieron. Aqui solo se estira
 * esa estructura: la lista es una tabla, y una tabla no tiene niveles.
 */
function aplanar(days: TeamDay[]): Fila[] {
  const filas: Fila[] = [];
  for (const dia of days) {
    for (const session of dia.sessions) {
      const key = sessionKey(session);
      if (!key) continue;
      filas.push({
        key,
        date: dia.date,
        agentName: dia.agentName,
        branchName: dia.branchName,
        session,
      });
    }
  }
  return filas;
}

function Atajo({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}

/** Una marca en la tabla: hora, sitio y, si hace falta, el aviso de precision. */
function Marca({
  mark,
  tipo,
  dia,
}: {
  mark: TeamMark;
  tipo: 'entrada' | 'salida';
  /** El dia al que la API apunta la jornada, para poder delatar el desfase. */
  dia: string;
}) {
  const Icono = tipo === 'entrada' ? LogIn : LogOut;
  // Una jornada se apunta al dia en que EMPEZO, asi que la que cruza medianoche
  // sale a una hora que pertenece al dia siguiente. Sin decirlo, la fila del
  // dia 24 con salida a las 00:25 se lee como si hubiera salido esa madrugada
  // —doce horas antes de cuando salio de verdad— y eso, en una nomina, es un
  // error que no detecta nadie.
  const desfase = daysBetween(dia, mark.date) - 1;

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <Icono
          aria-hidden
          className={cn(
            'size-3.5 shrink-0',
            tipo === 'entrada' ? 'text-emerald-700' : 'text-blue-700',
          )}
        />
        <strong className="tabular font-medium">{mark.time}</strong>
        {desfase !== 0 && (
          <span
            className="note normal-case"
            title={`${tipo === 'entrada' ? 'Entró' : 'Salió'} el ${dayShort(mark.date)}`}
          >
            {desfase > 0 ? `+${desfase} d` : `${desfase} d`}
          </span>
        )}
      </span>
      <span
        className="note max-w-64 truncate normal-case"
        title={mark.address ?? undefined}
      >
        {mark.address ?? 'Sin dirección'}
      </span>
      {/* Solo cuando la precision es tan mala que el punto deja de situar a
          nadie: avisar de un ±10 m seria ruido. */}
      {looseAccuracy(mark) && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {accuracyLabel(mark)}
        </span>
      )}
    </span>
  );
}

/** La leyenda del mapa. Sin ella, los dos colores son dos colores. */
function Leyenda() {
  return (
    <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-full" style={{ background: '#2f7d4f' }} aria-hidden />
        Entrada
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-[22%]" style={{ background: '#1d4ed8' }} aria-hidden />
        Salida
      </span>
      <span className="flex items-center gap-1.5">
        <i
          className="size-2.5 rounded-full border border-dashed border-muted-foreground"
          aria-hidden
        />
        Precisión del GPS
      </span>
    </span>
  );
}
