import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  api,
  type Agent,
  type Appointment,
  type CalendarPayload,
  type Client,
  type Property,
} from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Loading,
  Modal,
  PageBody,
  SelectField,
  TextareaField,
} from '../components/ui';
import { cn } from '../lib/utils';
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_TYPE_LABEL,
  WEEKDAYS_SHORT,
  dateTime,
  isoDate,
  time,
  toLocalInput,
} from '../lib/format';

export function Calendar() {
  const { can, user } = useAuth();
  const [cursor, setCursor] = useState(() => new Date());
  const [agentId, setAgentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const agents = useFetch<Agent[]>((signal) => api.get<Agent[]>('/agents', undefined, signal), []);

  const { data, error, loading, reload } = useFetch<CalendarPayload>(
    (signal) =>
      api.get<CalendarPayload>(
        '/calendar',
        { from: isoDate(monthStart), to: isoDate(monthEnd), agentId: agentId || undefined },
        signal,
      ),
    [monthStart.getTime(), monthEnd.getTime(), agentId],
  );

  /** Rejilla de 6 semanas: siempre la misma altura, sin saltos al cambiar de mes. */
  const grid = useMemo(() => {
    const first = new Date(monthStart);
    first.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(first);
      day.setDate(first.getDate() + i);
      return day;
    });
  }, [monthStart.getTime()]);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const day of data?.days ?? []) map.set(day.date, day.appointments);
    return map;
  }, [data]);

  const monthLabel = new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
  }).format(cursor);

  const today = isoDate(new Date());

  return (
    <>
      <PageHeader
        eyebrow="Agenda del equipo"
        title={monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        actions={
          <>
            {can('ADMIN', 'MANAGER', 'VIEWER') && (
              <SelectField
                label="Asesor"
                className="min-w-[170px]"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">Todo el equipo</option>
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.firstName} {agent.lastName ?? ''}
                  </option>
                ))}
              </SelectField>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" onClick={() => setCursor(new Date())}>
              Hoy
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Mes siguiente"
            >
              <ChevronRight />
            </Button>
            {can('ADMIN', 'MANAGER', 'AGENT') && (
              <Button onClick={() => setCreating(true)}>Agendar cita</Button>
            )}
          </>
        }
      />

      <PageBody>
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && (
          <>
            {/*
              El `gap-px` sobre `bg-border` es el truco de siempre para las
              lineas de un pixel: el fondo del contenedor asoma por las juntas y
              no hay que sumar bordes celda a celda.
            */}
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
              {WEEKDAYS_SHORT.map((day) => (
                <div
                  key={day}
                  className="micro-label bg-secondary px-2 py-1.5 text-center text-muted-foreground"
                >
                  {day}
                </div>
              ))}

              {grid.map((day) => {
                const key = isoDate(day);
                const appointments = byDate.get(key) ?? [];
                const outside = day.getMonth() !== cursor.getMonth();
                return (
                  <div
                    key={key}
                    data-out={outside || undefined}
                    data-today={key === today || undefined}
                    className="group flex min-h-[106px] flex-col gap-1 bg-card p-1.5 data-out:bg-secondary/60"
                  >
                    <span className="tabular grid size-5 shrink-0 place-items-center self-start rounded-full text-xs text-muted-foreground group-data-today:bg-primary group-data-today:text-primary-foreground">
                      {day.getDate()}
                    </span>
                    {appointments.slice(0, 4).map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        className={cn(
                          'block w-full truncate rounded-sm border-l-2 px-1.5 py-0.5 text-left text-xs leading-snug',
                          appointment.status === 'DONE'
                            ? 'border-muted-foreground bg-secondary text-muted-foreground'
                            : appointment.status === 'NO_SHOW'
                              ? 'border-destructive bg-red-50 text-red-800'
                              : 'border-emerald-600 bg-emerald-50',
                        )}
                        onClick={() => setSelected(appointment)}
                        title={appointment.title}
                      >
                        {time(appointment.startsAt)} · {appointment.title}
                      </button>
                    ))}
                    {appointments.length > 4 && (
                      <span className="note">+{appointments.length - 4}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {data.shifts.length > 0 && (
              <Card title="Turnos del asesor">
                <div className="flex flex-wrap gap-2">
                  {data.shifts.map((shift) => (
                    <Badge key={shift.id} tone={shift.kind === 'ON_CALL' ? 'amber' : 'neutral'}>
                      {WEEKDAYS_SHORT[shift.weekday]} {shift.startTime.slice(0, 5)}–
                      {shift.endTime.slice(0, 5)}
                      {shift.kind === 'ON_CALL' ? ' guardia' : ''}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {(data.days.length === 0 || !data.days.some((d) => d.appointments.length)) && (
              <Empty
                title="No hay citas este mes"
                action={
                  can('ADMIN', 'MANAGER', 'AGENT') && (
                    <Button onClick={() => setCreating(true)}>Agendar la primera</Button>
                  )
                }
              >
                Al agendar una visita se avisa si choca con otra cita o cae fuera del turno del
                asesor.
              </Empty>
            )}
          </>
        )}
      </PageBody>

      {creating && (
        <AppointmentModal
          defaultAgentId={agentId || user?.id || ''}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {selected && (
        <AppointmentDetail
          appointment={selected}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function AppointmentModal({
  defaultAgentId,
  onClose,
  onDone,
}: {
  defaultAgentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { can } = useAuth();
  const agents = useFetch<Agent[]>((signal) => api.get<Agent[]>('/agents', undefined, signal), []);

  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const [form, setForm] = useState({
    title: '',
    type: 'VISIT',
    startsAt: toLocalInput(start.toISOString()),
    endsAt: toLocalInput(end.toISOString()),
    agentId: defaultAgentId,
    clientId: '',
    propertyId: '',
    location: '',
    notes: '',
  });
  const [clientQuery, setClientQuery] = useState('');
  const [propertyQuery, setPropertyQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const debouncedClient = useDebounced(clientQuery);
  const debouncedProperty = useDebounced(propertyQuery);

  const clients = useFetch<{ data: Client[] }>(
    (signal) =>
      debouncedClient.trim().length < 2
        ? Promise.resolve({ data: [] })
        : api.get<{ data: Client[] }>('/clients', { q: debouncedClient, limit: 6 }, signal),
    [debouncedClient],
  );

  const properties = useFetch<{ data: Property[] }>(
    (signal) =>
      debouncedProperty.trim().length < 2
        ? Promise.resolve({ data: [] })
        : api.get<{ data: Property[] }>('/properties', { q: debouncedProperty, limit: 6 }, signal),
    [debouncedProperty],
  );

  async function save(force = false) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/appointments', {
        title: form.title.trim(),
        type: form.type,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        agentId: form.agentId || undefined,
        clientId: form.clientId || undefined,
        propertyId: form.propertyId || undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        force,
      });
      onDone();
    } catch (err) {
      // La API devuelve 409 cuando choca con otra cita o cae fuera de turno.
      // Es un aviso, no un bloqueo: se ofrece agendar igualmente.
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        setError(err.message);
      } else {
        setConflict(false);
        setError(err instanceof ApiError ? err.message : 'No se pudo agendar la cita.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Agendar cita"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {conflict && (
            <Button variant="destructive" loading={busy} onClick={() => void save(true)}>
              Agendar igualmente
            </Button>
          )}
          <Button
            loading={busy}
            disabled={!form.title.trim()}
            onClick={() => void save(false)}
          >
            Agendar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone={conflict ? 'warn' : 'error'}>{error}</Alert>}

        <Field
          label="Título"
          required
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Visita apartamento Cañaveral"
        />

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <SelectField
            label="Tipo"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {Object.entries(APPOINTMENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <Field
            label="Empieza"
            type="datetime-local"
            required
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          />
          <Field
            label="Termina"
            type="datetime-local"
            required
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          />
          {can('ADMIN', 'MANAGER') && (
            <SelectField
              label="Asesor"
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
            >
              <option value="">Yo</option>
              {(agents.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.firstName} {agent.lastName ?? ''}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <span className="micro-label text-muted-foreground">Cliente</span>
            <Input
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setForm({ ...form, clientId: '' });
              }}
              placeholder="Buscar por nombre o teléfono"
            />
            {!form.clientId &&
              (clients.data?.data ?? []).map((client) => (
                <Button
                  key={client.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    setForm({ ...form, clientId: client.id });
                    setClientQuery(`${client.firstName} ${client.lastName ?? ''}`);
                  }}
                >
                  {client.firstName} {client.lastName ?? ''}
                </Button>
              ))}
            {form.clientId && (
              <span className="text-xs text-muted-foreground">Cliente seleccionado</span>
            )}
          </div>

          <div className="grid content-start gap-1.5">
            <span className="micro-label text-muted-foreground">Inmueble</span>
            <Input
              value={propertyQuery}
              onChange={(e) => {
                setPropertyQuery(e.target.value);
                setForm({ ...form, propertyId: '' });
              }}
              placeholder="Buscar por código o título"
            />
            {!form.propertyId &&
              (properties.data?.data ?? []).map((property) => (
                <Button
                  key={property.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    setForm({ ...form, propertyId: property.id });
                    setPropertyQuery(`${property.code} · ${property.title.slice(0, 30)}`);
                  }}
                >
                  {property.code} · {property.title.slice(0, 34)}
                </Button>
              ))}
            {form.propertyId && (
              <span className="text-xs text-muted-foreground">Inmueble seleccionado</span>
            )}
          </div>
        </div>

        <Field
          label="Punto de encuentro"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="Si no es en el inmueble"
        />
        <TextareaField
          label="Notas"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </Modal>
  );
}

function AppointmentDetail({
  appointment,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const { can } = useAuth();
  const [outcome, setOutcome] = useState(appointment.outcome ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = ['DONE', 'CANCELED', 'NO_SHOW'].includes(appointment.status);

  async function close(status: 'DONE' | 'NO_SHOW' | 'CANCELED') {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/appointments/${appointment.id}/close`, {
        status,
        outcome: outcome.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cerrar la cita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={appointment.title}
      onClose={onClose}
      footer={
        !closed && can('ADMIN', 'MANAGER', 'AGENT') ? (
          <>
            <Button variant="destructive" loading={busy} onClick={() => void close('CANCELED')}>
              Cancelar cita
            </Button>
            <Button variant="outline" loading={busy} onClick={() => void close('NO_SHOW')}>
              No asistió
            </Button>
            <Button loading={busy} onClick={() => void close('DONE')}>
              Marcar realizada
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex flex-wrap gap-1.5">
          <Badge tone="blue">{APPOINTMENT_TYPE_LABEL[appointment.type]}</Badge>
          <Badge
            tone={
              appointment.status === 'DONE'
                ? 'green'
                : appointment.status === 'NO_SHOW'
                  ? 'red'
                  : 'neutral'
            }
          >
            {APPOINTMENT_STATUS_LABEL[appointment.status]}
          </Badge>
        </div>

        <dl className="grid">
          <Row label="Cuándo">
            {dateTime(appointment.startsAt)} — {time(appointment.endsAt)}
          </Row>
          <Row label="Asesor">
            {appointment.agent.firstName} {appointment.agent.lastName ?? ''}
          </Row>
          {appointment.client && (
            <Row label="Cliente">
              <Link
                to={`/clientes/${appointment.clientId}`}
                onClick={onClose}
                className="hover:underline"
              >
                {appointment.client.firstName} {appointment.client.lastName ?? ''}
              </Link>
            </Row>
          )}
          {appointment.property && (
            <Row label="Inmueble">
              <Link
                to={`/inmuebles/${appointment.propertyId}`}
                onClick={onClose}
                className="hover:underline"
              >
                {appointment.property.code} · {appointment.property.title.slice(0, 40)}
              </Link>
            </Row>
          )}
          {appointment.location && <Row label="Punto de encuentro">{appointment.location}</Row>}
          {appointment.notes && (
            <Row label="Notas">
              <span className="whitespace-pre-wrap">{appointment.notes}</span>
            </Row>
          )}
        </dl>

        {!closed && (
          <TextareaField
            label="Resultado"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="Qué pasó en la visita. Se guarda en el historial del cliente."
          />
        )}
        {closed && appointment.outcome && (
          <div>
            <span className="note">Resultado</span>
            <p className="mt-1 text-sm">{appointment.outcome}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Una fila de la ficha de la cita: rotulo a la izquierda, dato a la derecha. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
