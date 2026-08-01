import { useMemo, useState } from 'react';
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
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  SelectField,
  TextareaField,
} from '../components/ui';
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
              <label className="field" style={{ minWidth: 170 }}>
                <span>Asesor</span>
                <select
                  className="select"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  <option value="">Todo el equipo</option>
                  {(agents.data ?? []).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.firstName} {agent.lastName ?? ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Mes anterior"
            >
              ←
            </Button>
            <Button onClick={() => setCursor(new Date())}>Hoy</Button>
            <Button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Mes siguiente"
            >
              →
            </Button>
            {can('ADMIN', 'MANAGER', 'AGENT') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Agendar cita
              </Button>
            )}
          </>
        }
      />

      <div className="content stack">
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && (
          <>
            <div className="cal">
              {WEEKDAYS_SHORT.map((day) => (
                <div key={day} className="cal-dow">
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
                    className={`cal-day ${outside ? 'out' : ''} ${key === today ? 'today' : ''}`.trim()}
                  >
                    <span className="cal-num">{day.getDate()}</span>
                    {appointments.slice(0, 4).map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        className={`cal-item ${
                          appointment.status === 'DONE'
                            ? 'is-done'
                            : appointment.status === 'NO_SHOW'
                              ? 'is-missed'
                              : ''
                        }`.trim()}
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
                <div className="row row-wrap" style={{ gap: 8 }}>
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
              <Card>
                <Empty
                  title="No hay citas este mes"
                  action={
                    can('ADMIN', 'MANAGER', 'AGENT') && (
                      <Button variant="primary" onClick={() => setCreating(true)}>
                        Agendar la primera
                      </Button>
                    )
                  }
                >
                  Al agendar una visita se avisa si choca con otra cita o cae fuera del turno del
                  asesor.
                </Empty>
              </Card>
            )}
          </>
        )}
      </div>

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
          <Button onClick={onClose}>Cancelar</Button>
          {conflict && (
            <Button variant="danger" loading={busy} onClick={() => void save(true)}>
              Agendar igualmente
            </Button>
          )}
          <Button
            variant="primary"
            loading={busy}
            disabled={!form.title.trim()}
            onClick={() => void save(false)}
          >
            Agendar
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className={conflict ? 'alert alert-warn' : 'alert'}>{error}</div>}

        <Field
          label="Título"
          required
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Visita apartamento Cañaveral"
        />

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
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

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label>Cliente</label>
            <input
              className="input"
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setForm({ ...form, clientId: '' });
              }}
              placeholder="Buscar por nombre o teléfono"
            />
            {!form.clientId &&
              (clients.data?.data ?? []).map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => {
                    setForm({ ...form, clientId: client.id });
                    setClientQuery(`${client.firstName} ${client.lastName ?? ''}`);
                  }}
                >
                  {client.firstName} {client.lastName ?? ''}
                </button>
              ))}
            {form.clientId && <span className="field-hint">Cliente seleccionado</span>}
          </div>

          <div className="field">
            <label>Inmueble</label>
            <input
              className="input"
              value={propertyQuery}
              onChange={(e) => {
                setPropertyQuery(e.target.value);
                setForm({ ...form, propertyId: '' });
              }}
              placeholder="Buscar por código o título"
            />
            {!form.propertyId &&
              (properties.data?.data ?? []).map((property) => (
                <button
                  key={property.id}
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => {
                    setForm({ ...form, propertyId: property.id });
                    setPropertyQuery(`${property.code} · ${property.title.slice(0, 30)}`);
                  }}
                >
                  {property.code} · {property.title.slice(0, 34)}
                </button>
              ))}
            {form.propertyId && <span className="field-hint">Inmueble seleccionado</span>}
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
            <Button variant="danger" loading={busy} onClick={() => void close('CANCELED')}>
              Cancelar cita
            </Button>
            <Button loading={busy} onClick={() => void close('NO_SHOW')}>
              No asistió
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void close('DONE')}>
              Marcar realizada
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Cerrar</Button>
        )
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}

        <div className="row row-wrap" style={{ gap: 6 }}>
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

        <div className="table-wrap">
          <table className="data">
            <tbody>
              <tr>
                <td className="note">Cuándo</td>
                <td>
                  {dateTime(appointment.startsAt)} — {time(appointment.endsAt)}
                </td>
              </tr>
              <tr>
                <td className="note">Asesor</td>
                <td>
                  {appointment.agent.firstName} {appointment.agent.lastName ?? ''}
                </td>
              </tr>
              {appointment.client && (
                <tr>
                  <td className="note">Cliente</td>
                  <td>
                    <Link to={`/clientes/${appointment.clientId}`} onClick={onClose}>
                      {appointment.client.firstName} {appointment.client.lastName ?? ''}
                    </Link>
                  </td>
                </tr>
              )}
              {appointment.property && (
                <tr>
                  <td className="note">Inmueble</td>
                  <td>
                    <Link to={`/inmuebles/${appointment.propertyId}`} onClick={onClose}>
                      {appointment.property.code} · {appointment.property.title.slice(0, 40)}
                    </Link>
                  </td>
                </tr>
              )}
              {appointment.location && (
                <tr>
                  <td className="note">Punto de encuentro</td>
                  <td>{appointment.location}</td>
                </tr>
              )}
              {appointment.notes && (
                <tr>
                  <td className="note">Notas</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{appointment.notes}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
            <p style={{ fontSize: 'var(--t-small)', marginTop: 4 }}>{appointment.outcome}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
