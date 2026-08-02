import { useState } from 'react';
import { ApiError, api, type Agent, type Role, type Shift } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CheckField,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  SELECT_CLASS,
  SelectField,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';
import { Input } from '../components/ui/input';
import { ROLE_LABEL, WEEKDAYS, relative } from '../lib/format';
import { cn } from '../lib/utils';

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
            <CheckField
              label="Ver inactivos"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            {can('ADMIN') && (
              <Button onClick={() => setCreating(true)}>Nuevo asesor</Button>
            )}
          </>
        }
      />

      <PageBody>
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={5} />}

        {data && (
          <Card flush>
            <Table>
                <THead>
                  <tr>
                    <Th>Asesor</Th>
                    <Th>Perfil</Th>
                    <Th hideSm>Contacto</Th>
                    <Th>Estado</Th>
                    <Th num hideSm>
                      Último acceso
                    </Th>
                    <Th />
                  </tr>
                </THead>
                <TBody>
                  {data.map((agent) => (
                    <Tr key={agent.id}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Avatar
                            name={`${agent.firstName} ${agent.lastName ?? ''}`}
                            src={agent.photoUrl}
                          />
                          <span className="min-w-0">
                            <strong className="font-medium">
                              {agent.firstName} {agent.lastName ?? ''}
                            </strong>
                            {agent.id === user?.id && (
                              <>
                                {' '}
                                <Badge tone="blue">tú</Badge>
                              </>
                            )}
                            <div className="note mt-0.5">{agent.email}</div>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={agent.role === 'ADMIN' ? 'ink' : 'neutral'}>
                          {ROLE_LABEL[agent.role]}
                        </Badge>
                      </Td>
                      <Td hideSm className="tabular">
                        {agent.cellPhone ?? '—'}
                      </Td>
                      <Td>
                        {agent.status === 'ACTIVE' ? (
                          agent.mustSetPassword ? (
                            <Badge tone="amber">clave sin cambiar</Badge>
                          ) : (
                            <Badge tone="green">activo</Badge>
                          )
                        ) : (
                          <Badge tone="red">inactivo</Badge>
                        )}
                      </Td>
                      <Td num hideSm className="text-muted-foreground">
                        {agent.lastLoginAt ? relative(agent.lastLoginAt) : 'nunca'}
                      </Td>
                      <Td className="w-[120px]">
                        <Button variant="outline" size="sm" onClick={() => setShiftsFor(agent)}>
                          Turnos
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
            </Table>
          </Card>
        )}
      </PageBody>

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
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!form.firstName.trim() || !form.email.trim()}
            onClick={() => void save()}
          >
            Crear asesor
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warn">
          Entrará con la clave genérica de la agencia y la aplicación le exigirá cambiarla antes
          de poder ver nada.
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
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
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Guardar cuadro
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
        {loaded.loading && <Loading rows={3} />}

        <p className="text-xs text-muted-foreground">
          Al agendar una cita fuera de estas franjas la aplicación avisa antes de crearla. Las
          guardias reciben los contactos que entran fuera de horario.
        </p>

        {shifts.length === 0 && !loaded.loading && (
          <p className="note">Sin turnos definidos. Todo el horario se considera disponible.</p>
        )}

        {shifts.map((shift, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              className={cn(SELECT_CLASS, 'w-[130px]')}
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
            <Input
              className="w-[110px]"
              type="time"
              value={shift.startTime}
              onChange={(e) => update(index, { startTime: e.target.value })}
              disabled={!editable}
            />
            <Input
              className="w-[110px]"
              type="time"
              value={shift.endTime}
              onChange={(e) => update(index, { endTime: e.target.value })}
              disabled={!editable}
            />
            <select
              className={cn(SELECT_CLASS, 'w-[130px]')}
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
                variant="destructive"
                onClick={() => setDraft(shifts.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            )}
          </div>
        ))}

        {editable && (
          <Button
            variant="outline"
            className="self-start"
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
