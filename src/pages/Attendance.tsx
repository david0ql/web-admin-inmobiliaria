import { useEffect, useState } from 'react';
import { CheckCircle2, Crosshair, LogIn, LogOut, MapPin } from 'lucide-react';
import { ApiError } from '../lib/api';
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
} from '../components/ui';
import {
  attendance,
  bogotaToday,
  dayLabel,
  duration,
  longDateTime,
  type AttendanceDay,
  type AttendanceMark,
  type MyHistory,
  type TodayStatus,
} from '../lib/attendance';
import { GeoHelp } from '../components/attendance/GeoHelp';
import { useGeolocation } from '../components/attendance/useGeolocation';

/** Dos semanas hacia atras: lo que cabe mirar sin filtros ni paginacion. */
const HISTORY_DAYS = 14;

/** Por encima de esto el punto puede caer a un par de manzanas de distancia. */
const POOR_ACCURACY_M = 100;

/**
 * Mi asistencia: la pantalla que abre el equipo a las ocho de la mañana.
 *
 * El orden de la pagina es el orden de las preguntas: estoy dentro o fuera,
 * marco, veo que quedo registrado, y luego el resumen del dia y los dias
 * anteriores. Lo unico que hay que poder hacer sin pensar es el boton.
 */
export function Attendance() {
  const { data, error, loading, reload } = useFetch<TodayStatus>(
    (signal) => attendance.today(signal),
    [],
  );

  const to = bogotaToday();
  const from = bogotaToday(-(HISTORY_DAYS - 1));
  const history = useFetch<MyHistory>(
    (signal) => attendance.mine(from, to, signal),
    [from, to],
  );

  /*
    Marcar devuelve el estado del dia ya recalculado, y se usa ese en vez de
    volver a preguntar: lo que la persona ve inmediatamente despues de pulsar
    es la respuesta de su propia marca, no la de una segunda peticion que
    podria llegar antes o despues.
  */
  const [fresh, setFresh] = useState<TodayStatus | null>(null);
  useEffect(() => setFresh(null), [data]);
  const today = fresh ?? data;

  const geo = useGeolocation();
  const [marking, setMarking] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  /** La marca recien hecha: el usuario quiere ver la hora que quedo escrita. */
  const [justMarked, setJustMarked] = useState<AttendanceMark | null>(null);

  const inside = today?.working ?? false;

  async function mark() {
    if (!today) return;
    setApiError(null);
    setJustMarked(null);

    /*
      La ubicacion se pide aqui, al pulsar, y no al abrir la pantalla: el
      navegador solo enseña el dialogo una vez en la vida del sitio y se
      concede muchisimo mas cuando ya se sabe para que es. Pedirla de entrada
      —antes de que nadie haya querido hacer nada— es la forma mas rapida de
      llevarse un "no" permanente.
    */
    let fix;
    try {
      fix = await geo.request();
    } catch {
      // El hook ya guardo el fallo con su causa; lo pinta `GeoHelp`.
      return;
    }

    setMarking(true);
    try {
      const done = await attendance.mark({
        type: inside ? 'OUT' : 'IN',
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy === null ? undefined : Math.round(fix.accuracy),
      });
      setJustMarked(done.mark);
      setFresh(done.status);
      history.reload();
    } catch (err) {
      setApiError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo registrar la marca. Revisa la conexión e inténtalo otra vez.',
      );
      // Un 409 quiere decir que el estado que hay en pantalla ya no es el
      // verdadero —se marco desde otro dispositivo—: recargarlo pone el boton
      // que toca debajo del mensaje.
      if (err instanceof ApiError && err.status === 409) reload();
    } finally {
      setMarking(false);
    }
  }

  const busy = geo.locating || marking;
  const previous = (history.data?.days ?? []).filter((day) => day.date !== to);

  return (
    <>
      <PageHeader eyebrow="Jornada" title="Mi asistencia" />

      <PageBody className="mx-auto w-full max-w-3xl">
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !today && <Loading rows={4} />}

        {today && (
          <>
            <Card>
              <Status now={today} />

              {/* El aviso llega antes de pulsar: si el permiso ya esta
                  bloqueado, el boton no puede hacer nada y es mejor decirlo
                  que dejar que falle. */}
              {geo.permission === 'denied' && !geo.failure && (
                <Alert tone="warn" className="mt-4">
                  Tienes bloqueada la ubicación en este navegador. Actívala antes de marcar:
                  sin coordenadas la marca no se puede registrar.
                </Alert>
              )}

              <Button
                className="mt-5 h-14 w-full text-base font-semibold tracking-wide"
                onClick={mark}
                loading={busy}
                aria-live="polite"
              >
                {!busy && (inside ? <LogOut aria-hidden /> : <LogIn aria-hidden />)}
                {geo.locating
                  ? 'Buscando tu ubicación…'
                  : marking
                    ? 'Registrando…'
                    : inside
                      ? 'Ya me voy'
                      : 'Ya entré'}
              </Button>

              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {geo.locating
                  ? 'El GPS puede tardar unos segundos. No cierres la página.'
                  : 'Al marcar se guardan tus coordenadas junto con la hora.'}
              </p>

              {geo.failure && (
                <div className="mt-4">
                  <GeoHelp failure={geo.failure} onRetry={mark} retrying={busy} />
                </div>
              )}

              {/* La precision solo se enseña cuando es mala: si el punto sale a
                  doscientos metros, quien marco tiene que saber por que. */}
              {!geo.failure &&
                geo.fix?.accuracy != null &&
                geo.fix.accuracy > POOR_ACCURACY_M && (
                  <Alert tone="warn" className="mt-4">
                    Tu ubicación llegó con una precisión de ±{Math.round(geo.fix.accuracy)} m,
                    así que el punto guardado puede quedar a esa distancia. Suele pasar bajo
                    techo; cerca de una ventana mejora.
                  </Alert>
                )}

              {apiError && (
                <Alert tone="error" className="mt-4">
                  {apiError}
                </Alert>
              )}

              {justMarked && (
                <Alert tone="ok" className="mt-4">
                  <span className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <strong className="font-medium">
                        {justMarked.type === 'IN' ? 'Entrada' : 'Salida'} registrada
                      </strong>{' '}
                      el {longDateTime(justMarked.at)} (hora de Colombia).
                      {justMarked.address && <> Desde {justMarked.address}.</>}
                    </span>
                  </span>
                </Alert>
              )}
            </Card>

            <Card
              title="Hoy"
              action={
                <span className="tabular text-sm font-semibold">
                  {duration(today.workedMinutes)}
                  {/* La jornada abierta la dice `working`, no las sesiones de
                      hoy: quien entro anoche y sigue dentro no tiene ninguna
                      sesion apuntada a hoy —la jornada cuenta en el dia en que
                      empezo— y esa es justo la persona a la que hay que
                      recordarle que la tiene sin cerrar. */}
                  {today.working && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      jornada abierta
                    </span>
                  )}
                </span>
              }
            >
              {today.marks.length ? (
                <ol className="flex flex-col gap-3">
                  {today.marks.map((item) => (
                    <MarkRow key={item.id} mark={item} />
                  ))}
                </ol>
              ) : today.working ? (
                /*
                  Dentro pero sin marcas hoy: la entrada fue ayer y sigue
                  abierta. Un "todavia no has marcado nada hoy" a secas aqui
                  suena a que no ha fichado, que es lo contrario de lo que pasa.
                */
                <p className="text-sm text-muted-foreground">
                  Tu entrada quedó apuntada al día en que la hiciste y la jornada sigue
                  abierta. Cuando marques la salida, el total contará en ese día.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no has marcado nada hoy.
                </p>
              )}
            </Card>
          </>
        )}

        {history.error && <ErrorNote onRetry={history.reload}>{history.error}</ErrorNote>}

        {previous.length > 0 && (
          <Card title="Días anteriores" flush>
            <ul className="divide-y">
              {previous.map((day) => (
                <DayRow key={day.date} day={day} />
              ))}
            </ul>
          </Card>
        )}

        {today && !history.loading && !history.error && previous.length === 0 && (
          <Empty title="Sin días anteriores">
            Aquí aparecerá el total de cada jornada en cuanto tengas marcas de otros días.
          </Empty>
        )}
      </PageBody>
    </>
  );
}

/** Dentro o fuera, y desde cuando. Es lo primero que mira quien abre esto. */
function Status({ now }: { now: TodayStatus }) {
  const [, setTick] = useState(0);

  // El contador de "llevas dentro" se refresca solo: la pantalla se queda
  // abierta toda la mañana y una cifra congelada a las 08:03 miente.
  useEffect(() => {
    if (!now.working) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [now.working]);

  if (!now.lastMark) {
    return (
      <div>
        <Badge>Fuera</Badge>
        <p className="mt-2.5 text-2xl font-semibold tracking-tight">
          Todavía no has marcado
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu primera marca será la entrada de hoy.
        </p>
      </div>
    );
  }

  const last = now.lastMark;
  // El dia se compara con el que dice la API, que ya viene en hora de Colombia.
  const when =
    last.date === now.date
      ? `a las ${last.time}`
      : `${dayLabel(last.date).toLowerCase()} a las ${last.time}`;
  const since = now.openSince ?? last.at;
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 60_000));

  return (
    <div>
      <Badge tone={now.working ? 'green' : 'neutral'}>
        {now.working ? 'Dentro' : 'Fuera'}
      </Badge>
      <p className="mt-2.5 text-2xl font-semibold tracking-tight">
        {now.working ? 'Entraste' : 'Saliste'} {when}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {minutes < 1
          ? 'Hace un momento.'
          : now.working
            ? `Llevas ${duration(minutes)} dentro.`
            : `Hace ${duration(minutes)}.`}
      </p>
    </div>
  );
}

function MarkRow({ mark }: { mark: AttendanceMark }) {
  const isIn = mark.type === 'IN';
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          isIn
            ? 'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700'
            : 'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground'
        }
        aria-hidden
      >
        {isIn ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <strong className="font-medium">{isIn ? 'Entrada' : 'Salida'}</strong>
          <span className="tabular text-sm">{mark.time}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {mark.address && <span className="min-w-0 truncate">{mark.address}</span>}
          {mark.accuracyM != null && mark.accuracyM > POOR_ACCURACY_M && (
            <span className="inline-flex items-center gap-1">
              <Crosshair className="size-3" aria-hidden />±{mark.accuracyM} m
            </span>
          )}
        </span>
      </span>
    </li>
  );
}

function DayRow({ day }: { day: AttendanceDay }) {
  /*
    El rango sale de las jornadas y no de las marcas sueltas porque las
    jornadas cruzan la medianoche: una que empezo a las 23:40 se apunta a este
    dia aunque su salida sea una marca del dia siguiente, y buscandola entre
    las marcas de hoy no aparece —saldria "sin cerrar" una jornada ya cerrada—.
    `checkIn` puede venir nulo cuando la entrada quedo fuera del rango pedido.
  */
  const first = day.sessions.find((s) => s.checkIn)?.checkIn ?? day.marks[0];
  const last = [...day.sessions].reverse().find((s) => s.checkOut)?.checkOut;

  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="min-w-0">
        {/* `capitalize` pondria mayuscula en cada palabra —"Jueves, 27 De
            Agosto"—; aqui solo la lleva la primera letra. */}
        <strong className="block truncate font-medium first-letter:uppercase">
          {dayLabel(day.date)}
        </strong>
        <span className="tabular text-xs text-muted-foreground">
          {first ? first.time : '—'} – {last ? last.time : '—'}
          {day.marks.length > 2 && ` · ${day.marks.length} marcas`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular font-semibold">{duration(day.workedMinutes)}</span>
        {day.open && <span className="block text-xs text-muted-foreground">sin salida</span>}
      </span>
    </li>
  );
}
