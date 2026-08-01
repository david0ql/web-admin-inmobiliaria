import { useState } from 'react';
import { ApiError, api, type Agent, type Role, type Shift } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  Modal,
  SelectField,
} from '../components/ui';
import { ROLE_LABEL, WEEKDAYS, relative } from '../lib/format';

export function Team() {
  const { can, user } = useAuth();
  const [includeInactive, setIncludeInactive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [shiftsFor, setShiftsFor] = useState<Agent | null>(null);

  const { data, error, loading, reload } = useFetch<Agent[]>(
    (signal) => api.get<Agent[]>('/agents', { includeInactive }, signal),
    [includeInactive],
  );

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Equipo"
        actions={
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Ver inactivos
            </label>
            {can('ADMIN') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Nuevo asesor
              </Button>
            )}
          </>
        }
      />

      <div className="content stack">
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={5} />}

        {data && (
          <Card flush>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Asesor</th>
                    <th>Perfil</th>
                    <th className="hide-sm">Contacto</th>
                    <th>Estado</th>
                    <th className="num hide-sm">Último acceso</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        <span className="row" style={{ gap: 9 }}>
                          <Avatar
                            name={`${agent.firstName} ${agent.lastName ?? ''}`}
                            src={agent.photoUrl}
                          />
                          <span>
                            <strong>
                              {agent.firstName} {agent.lastName ?? ''}
                            </strong>
                            {agent.id === user?.id && (
                              <>
                                {' '}
                                <Badge tone="blue">tú</Badge>
                              </>
                            )}
                            <div className="note" style={{ marginTop: 2 }}>
                              {agent.email}
                            </div>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Badge tone={agent.role === 'ADMIN' ? 'ink' : 'neutral'}>
                          {ROLE_LABEL[agent.role]}
                        </Badge>
                      </td>
                      <td className="hide-sm figure small">{agent.cellPhone ?? '—'}</td>
                      <td>
                        {agent.status === 'ACTIVE' ? (
                          agent.mustSetPassword ? (
                            <Badge tone="amber">clave sin cambiar</Badge>
                          ) : (
                            <Badge tone="green">activo</Badge>
                          )
                        ) : (
                          <Badge tone="red">inactivo</Badge>
                        )}
                      </td>
                      <td className="num small muted hide-sm">
                        {agent.lastLoginAt ? relative(agent.lastLoginAt) : 'nunca'}
                      </td>
                      <td style={{ width: 120 }}>
                        <Button size="sm" onClick={() => setShiftsFor(agent)}>
                          Turnos
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {creating && (
        <NewAgentModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {shiftsFor && (
        <ShiftsModal agent={shiftsFor} onClose={() => setShiftsFor(null)} editable={can('ADMIN', 'MANAGER')} />
      )}
    </>
  );
}

function NewAgentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    cellPhone: '',
    role: 'AGENT' as Role,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/agents', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        cellPhone: form.cellPhone.trim() || undefined,
        role: form.role,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el asesor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nuevo asesor"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!form.firstName.trim() || !form.email.trim()}
            onClick={() => void save()}
          >
            Crear asesor
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}
        <div className="alert alert-warn">
          Entrará con la clave genérica de la agencia y la aplicación le exigirá cambiarla antes
          de poder ver nada.
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field
            label="Nombre"
            required
            autoFocus
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <Field
            label="Apellidos"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          <Field
            label="Correo"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Field
            label="Celular"
            value={form.cellPhone}
            onChange={(e) => setForm({ ...form, cellPhone: e.target.value })}
          />
        </div>

        <SelectField
          label="Perfil"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          hint="Un asesor solo ve su propia cartera"
        >
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
    </Modal>
  );
}

interface DraftShift {
  weekday: number;
  startTime: string;
  endTime: string;
  kind: 'OFFICE' | 'ON_CALL';
}

function ShiftsModal({
  agent,
  onClose,
  editable,
}: {
  agent: Agent;
  onClose: () => void;
  editable: boolean;
}) {
  const loaded = useFetch<Shift[]>(
    (signal) => api.get<Shift[]>(`/agents/${agent.id}/shifts`, undefined, signal),
    [agent.id],
  );
  const [draft, setDraft] = useState<DraftShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shifts: DraftShift[] =
    draft ??
    (loaded.data ?? []).map((shift) => ({
      weekday: shift.weekday,
      startTime: shift.startTime.slice(0, 5),
      endTime: shift.endTime.slice(0, 5),
      kind: shift.kind,
    }));

  function update(index: number, patch: Partial<DraftShift>) {
    setDraft(shifts.map((shift, i) => (i === index ? { ...shift, ...patch } : shift)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/agents/${agent.id}/shifts`, { shifts });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los turnos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Turnos de ${agent.firstName}`}
      onClose={onClose}
      wide
      footer={
        editable ? (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Guardar cuadro
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Cerrar</Button>
        )
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}
        {loaded.loading && <Loading rows={3} />}

        <p className="field-hint">
          Al agendar una cita fuera de estas franjas la aplicación avisa antes de crearla. Las
          guardias reciben los contactos que entran fuera de horario.
        </p>

        {shifts.length === 0 && !loaded.loading && (
          <p className="note">Sin turnos definidos. Todo el horario se considera disponible.</p>
        )}

        {shifts.map((shift, index) => (
          <div key={index} className="row" style={{ gap: 8 }}>
            <select
              className="select"
              style={{ flex: '0 0 130px' }}
              value={shift.weekday}
              onChange={(e) => update(index, { weekday: Number(e.target.value) })}
              disabled={!editable}
            >
              {WEEKDAYS.map((day, i) => (
                <option key={i} value={i}>
                  {day}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ flex: '0 0 110px' }}
              type="time"
              value={shift.startTime}
              onChange={(e) => update(index, { startTime: e.target.value })}
              disabled={!editable}
            />
            <input
              className="input"
              style={{ flex: '0 0 110px' }}
              type="time"
              value={shift.endTime}
              onChange={(e) => update(index, { endTime: e.target.value })}
              disabled={!editable}
            />
            <select
              className="select"
              style={{ flex: '0 0 130px' }}
              value={shift.kind}
              onChange={(e) => update(index, { kind: e.target.value as DraftShift['kind'] })}
              disabled={!editable}
            >
              <option value="OFFICE">Oficina</option>
              <option value="ON_CALL">Guardia</option>
            </select>
            {editable && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setDraft(shifts.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            )}
          </div>
        ))}

        {editable && (
          <Button
            onClick={() =>
              setDraft([
                ...shifts,
                { weekday: 1, startTime: '08:00', endTime: '18:00', kind: 'OFFICE' },
              ])
            }
          >
            Añadir franja
          </Button>
        )}
      </div>
    </Modal>
  );
}
