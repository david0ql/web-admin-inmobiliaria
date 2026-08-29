import { useState } from 'react';
import {
  ApiError,
  api,
  canEditAgent,
  canResetPassword,
  runsBranch,
  seesAllBranches,
  type Agent,
  type Role,
  type Shift,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { useBranch } from '../lib/branch';
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
  SectionHeading,
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
import { ASSIGNABLE_ROLES, ROLE_LABEL, WEEKDAYS, relative } from '../lib/format';
import {
  IdentityFields,
  PhotoPicker,
  draftFrom,
  identityPayload,
  type IdentityDraft,
} from '../components/people/identity';
import { cn } from '../lib/utils';

export function Team() {
  const { can, user } = useAuth();
  const { branches } = useBranch();
  const [includeInactive, setIncludeInactive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
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
            {/* El coordinador da de alta a los suyos; la API le limita a
                asesores y consulta, y a su propia sede. */}
            {can('ADMIN', 'COORDINATOR', 'MANAGER') && (
              <Button onClick={() => setCreating(true)}>Nuevo usuario</Button>
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
                    <Th hideSm>Sede</Th>
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
                          {ROLE_LABEL[agent.role] ?? agent.role}
                        </Badge>
                      </Td>
                      <Td hideSm>
                        {/* Sin sede no es un dato que falte: es que manda en
                            todas, y decirlo asi evita leerlo como un hueco. */}
                        {agent.branchId ? (
                          (branches.find((b) => b.id === agent.branchId)?.name ??
                          '—')
                        ) : (
                          <span className="text-muted-foreground">Todas las sedes</span>
                        )}
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
                      <Td className="w-[200px]">
                        <span className="flex justify-end gap-2">
                          {/* El boton solo aparece donde la API va a decir que
                              si. Quien no puede editar a nadie tampoco ve una
                              columna de botones muertos. */}
                          {canEditAgent(user, agent) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditing(agent)}
                            >
                              Editar
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => setShiftsFor(agent)}>
                            Turnos
                          </Button>
                        </span>
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

      {editing && (
        <EditAgentModal
          agent={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {shiftsFor && (
        <ShiftsModal
          agent={shiftsFor}
          onClose={() => setShiftsFor(null)}
          editable={can('ADMIN', 'MANAGER', 'COORDINATOR')}
        />
      )}
    </>
  );
}

/**
 * Alta de usuario.
 *
 * Dos cosas que no son cosmeticas: la sede es obligatoria salvo en los dos
 * perfiles que las ven todas —un asesor sin oficina no tendria inventario que
 * mirar—, y a quien manda en una sola sede se le da su sede fija y una lista
 * de perfiles recortada. Lo segundo lo vuelve a comprobar la API: esto es para
 * que el formulario no ofrezca lo que va a rechazarse, no la barrera.
 */
function NewAgentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { branches, branchId } = useBranch();
  const desdeUnaSede = runsBranch(user?.role);

  const perfiles: Role[] = desdeUnaSede
    ? ['AGENT', 'VIEWER']
    : (ASSIGNABLE_ROLES.filter(
        (role) => role !== 'ADMIN' || user?.role === 'ADMIN',
      ) as Role[]);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    cellPhone: '',
    role: 'AGENT' as Role,
    // Al coordinador se le impone la suya; al administrador se le propone la
    // que tenga puesta en el selector, que es donde esta trabajando.
    branchId: desdeUnaSede
      ? (user?.branchId ?? '')
      : (branchId ?? (branches.length === 1 ? branches[0].id : '')),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pideSede = !seesAllBranches(form.role);

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
        branchId: pideSede ? form.branchId : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={
              !form.firstName.trim() ||
              !form.email.trim() ||
              (pideSede && !form.branchId)
            }
            onClick={() => void save()}
          >
            Crear usuario
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
          hint={
            desdeUnaSede
              ? 'Desde una sede solo se dan de alta asesores y perfiles de solo lectura.'
              : 'El asesor solo ve su propia cartera; el coordinador, la de toda su sede.'
          }
        >
          {perfiles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </SelectField>

        {pideSede ? (
          <SelectField
            label="Sede"
            required
            value={form.branchId}
            disabled={desdeUnaSede}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            hint={
              desdeUnaSede
                ? 'Solo puedes dar de alta en tu propia sede.'
                : 'De ella cuelgan su inventario y sus clientes.'
            }
          >
            <option value="">Elige una sede</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[form.role]} no pertenece a ninguna sede: las ve todas.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * La ficha de una persona vista desde el equipo.
 *
 * Tres bloques y en este orden a proposito: quien es, que perfil tiene y como
 * entra. El ultimo es un restablecimiento —no un «cambiar contrasena»— y se
 * dice asi de claro, porque quien lo usa no sabe la clave vieja y la persona
 * afectada se va a encontrar con la sesion cerrada.
 *
 * Los bloques que no le tocan a quien mira no se pintan apagados: se quitan.
 * Un formulario lleno de campos grises sin explicar solo genera preguntas.
 */
function EditAgentModal({
  agent,
  onClose,
  onDone,
}: {
  agent: Agent;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { branches } = useBranch();

  const [draft, setDraft] = useState<IdentityDraft>(() => draftFrom(agent));
  const [photoUrl, setPhotoUrl] = useState(agent.photoUrl);
  // `MANAGER` es el nombre viejo de `COORDINATOR` y no esta en la lista de
  // perfiles que se ofrecen: se muestra ya con el nombre nuevo, que es lo que
  // se guardaria si se toca cualquier otra cosa de la ficha.
  const [role, setRole] = useState<Role>(
    agent.role === 'MANAGER' ? 'COORDINATOR' : agent.role,
  );
  const [branchId, setBranchId] = useState(agent.branchId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const esUnoMismo = agent.id === user?.id;
  // El perfil y la sede los mueve la administracion y nunca sobre si misma:
  // la misma regla que impone `assertCanChangeRoleOrBranch` en la API.
  const puedeMoverRango = user?.role === 'ADMIN' && !esUnoMismo;
  const pideSede = !seesAllBranches(role);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/agents/${agent.id}`, {
        ...identityPayload(draft),
        ...(puedeMoverRango
          ? { role, branchId: pideSede ? branchId : null }
          : {}),
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Ficha de ${agent.firstName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={
              !draft.firstName.trim() ||
              !draft.email.trim() ||
              (puedeMoverRango && pideSede && !branchId)
            }
            onClick={() => void save()}
          >
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <PhotoPicker
          agentId={agent.id}
          name={`${agent.firstName} ${agent.lastName ?? ''}`}
          photoUrl={photoUrl}
          onChanged={(actualizado) => setPhotoUrl(actualizado.photoUrl)}
        />

        <IdentityFields draft={draft} onChange={setDraft} />

        {puedeMoverRango ? (
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <SelectField
              label="Perfil"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </SelectField>
            {pideSede ? (
              <SelectField
                label="Sede"
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Elige una sede</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <p className="self-end text-xs text-muted-foreground">
                {ROLE_LABEL[role]} no pertenece a ninguna sede: las ve todas.
              </p>
            )}
          </div>
        ) : (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            El perfil ({ROLE_LABEL[agent.role] ?? agent.role}) y la sede solo los
            cambia la administración.
          </p>
        )}

        {canResetPassword(user, agent) && (
          <ResetPasswordSection agent={agent} />
        )}

        {esUnoMismo && (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Para cambiar tu contraseña ve a «Mi cuenta»: allí se te pide la actual.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Restablecer la contrasena de otra persona.
 *
 * Separado del resto del formulario y con su propio boton: no se guarda «de
 * paso» al pulsar Guardar cambios. Cambiarle la clave a alguien le tira las
 * sesiones abiertas y le obliga a elegir una nueva al entrar, y eso no puede
 * pasar por descuido mientras se corrige un apellido.
 */
function ResetPasswordSection({ agent }: { agent: Agent }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (password !== repeat) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/agents/${agent.id}/password`, { password });
      setDone(true);
      setPassword('');
      setRepeat('');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <SectionHeading light="Restablecer" strong="contraseña" as="h3" />
      <p className="text-xs text-muted-foreground">
        Dale una contraseña provisional y dísela por un canal aparte. Al guardarla
        se le cierran todas las sesiones y la aplicación le exigirá elegir una
        suya en el siguiente acceso.
      </p>

      {error && <Alert>{error}</Alert>}
      {done && (
        <Alert tone="warn">
          Contraseña restablecida. Sus sesiones abiertas ya no valen.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Contraseña provisional"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Repítela"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>

      <Button
        variant="outline"
        className="self-start"
        loading={busy}
        disabled={password.length < 8}
        onClick={() => void reset()}
      >
        Restablecer contraseña
      </Button>
    </div>
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
