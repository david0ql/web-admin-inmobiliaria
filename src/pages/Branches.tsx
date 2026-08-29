import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ApiError,
  api,
  seesAllBranches,
  type Agent,
  type Branch,
  type Catalogs,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { useBranch } from '../lib/branch';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckField,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  SelectField,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';
import { ROLE_LABEL } from '../lib/format';

/**
 * Las oficinas de la agencia.
 *
 * Es la unica pantalla del panel que se mira desde fuera de una sede: aqui no
 * se trabaja con inventario ni con clientes, se decide que oficinas existen y
 * quien las lleva. Por eso el selector del rail no la afecta —`GET /branches`
 * devuelve todas al administrador con la cabecera que sea— y por eso solo la
 * ve el; abrir una oficina no es una decision de oficina.
 */
export function Branches() {
  const { user } = useAuth();
  const { reload: reloadPicker } = useBranch();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Branch | null>(null);

  const branches = useFetch<Branch[]>(
    (signal) => api.get<Branch[]>('/branches', undefined, signal),
    [],
  );
  const coordinators = useFetch<Agent[]>(
    (signal) => api.get<Agent[]>('/branches/coordinators', undefined, signal),
    [],
  );
  const catalogs = useFetch<Catalogs>(
    (signal) => api.get<Catalogs>('/catalogs/bootstrap', undefined, signal),
    [],
  );

  // El rail lista las sedes: si aqui se abre una nueva o se desactiva otra, el
  // selector tiene que enterarse sin que haya que recargar la aplicacion.
  function refrescar() {
    branches.reload();
    coordinators.reload();
    reloadPicker();
  }

  if (user && user.role !== 'ADMIN') return <Navigate to="/" replace />;

  const cities = catalogs.data?.cities ?? [];
  const cityName = (id: number | null) =>
    cities.find((city) => city.id === id)?.name ?? '—';
  const coordinatorOf = (branchId: string) =>
    (coordinators.data ?? []).find((agent) => agent.branchId === branchId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Sedes"
        actions={<Button onClick={() => setCreating(true)}>Nueva sede</Button>}
      />

      <PageBody>
        {/*
          El orden importa y la agencia lo pidio explicito: la sede no crea
          usuarios, solo nombra a uno que ya existe. Decirlo aqui evita el
          viaje de ida y vuelta a Equipo con el modal abierto a medias.
        */}
        <Alert
          tone="warn"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/equipo">Ir a Equipo</Link>
            </Button>
          }
        >
          El coordinador se pone en dos pasos: primero se crea el usuario en{' '}
          <strong className="font-semibold">Equipo</strong> y después se le nombra
          coordinador aquí. Nombrarlo le cambia el perfil a coordinador de sede y lo
          traslada a esta oficina.
        </Alert>

        {branches.error && <ErrorNote onRetry={branches.reload}>{branches.error}</ErrorNote>}
        {branches.loading && !branches.data && <Loading rows={4} />}

        {branches.data && (
          <Card flush>
            <Table>
              <THead>
                <tr>
                  <Th>Sede</Th>
                  <Th hideSm>Ciudad</Th>
                  <Th hideSm>Dirección</Th>
                  <Th hideSm>Teléfono</Th>
                  <Th>Coordinación</Th>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {branches.data.map((branch) => {
                  const coordinator = coordinatorOf(branch.id);
                  return (
                    <Tr key={branch.id}>
                      <Td>
                        <strong className="font-medium">{branch.name}</strong>
                        <div className="note mt-0.5 flex items-center gap-1.5">
                          <span className="tabular">{branch.code}</span>
                          {branch.isDefault && <Badge tone="blue">principal</Badge>}
                        </div>
                      </Td>
                      <Td hideSm>{cityName(branch.cityId)}</Td>
                      <Td hideSm className="text-muted-foreground">
                        {branch.address ?? '—'}
                      </Td>
                      <Td hideSm className="tabular">
                        {branch.phone ?? '—'}
                      </Td>
                      <Td>
                        {coordinator ? (
                          <>
                            <strong className="font-medium">
                              {coordinator.firstName} {coordinator.lastName ?? ''}
                            </strong>
                            <div className="note mt-0.5">{coordinator.email}</div>
                          </>
                        ) : (
                          <Badge tone="amber">sin coordinador</Badge>
                        )}
                      </Td>
                      <Td>
                        {branch.active ? (
                          <Badge tone="green">activa</Badge>
                        ) : (
                          <Badge tone="red">inactiva</Badge>
                        )}
                      </Td>
                      <Td className="w-[200px] whitespace-nowrap">
                        <span className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(branch)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAssigning(branch)}
                          >
                            Coordinador
                          </Button>
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}
      </PageBody>

      {(creating || editing) && (
        <BranchModal
          branch={editing}
          cities={cities}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onDone={() => {
            setCreating(false);
            setEditing(null);
            refrescar();
          }}
        />
      )}

      {assigning && (
        <CoordinatorModal
          branch={assigning}
          current={coordinatorOf(assigning.id)}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            refrescar();
          }}
        />
      )}
    </>
  );
}

/** Alta y edicion comparten formulario: cambian el titulo y el verbo. */
function BranchModal({
  branch,
  cities,
  onClose,
  onDone,
}: {
  branch: Branch | null;
  cities: Catalogs['cities'];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    cityId: branch?.cityId ? String(branch.cityId) : '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
    active: branch?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        cityId: form.cityId ? Number(form.cityId) : undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
      };
      if (branch) {
        await api.patch(`/branches/${branch.id}`, { ...payload, active: form.active });
      } else {
        await api.post('/branches', payload);
      }
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar la sede.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={branch ? `Sede ${branch.name}` : 'Nueva sede'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!form.name.trim() || form.code.trim().length < 2}
            onClick={() => void save()}
          >
            {branch ? 'Guardar sede' : 'Abrir sede'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {!branch && (
          <Alert tone="warn">
            La sede nace vacía y sin coordinador. Cuando exista, se le asigna uno de
            los usuarios del equipo desde el listado.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            hint="Como la llama la agencia: Bucaramanga, Bogotá norte…"
          />
          <Field
            label="Código"
            required
            maxLength={12}
            value={form.code}
            // En mayusculas siempre: sale en listados y filtros junto al
            // nombre, y "bga" y "BGA" leidos en la misma columna parecen dos.
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            hint="Corto y estable: BGA, BOG."
          />
          <SelectField
            label="Ciudad"
            value={form.cityId}
            onChange={(e) => setForm({ ...form, cityId: e.target.value })}
          >
            <option value="">Sin especificar</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Field
            label="Dirección"
            className="sm:col-span-2"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>

        {branch && (
          <div>
            <CheckField
              label="Sede activa"
              checked={form.active}
              disabled={branch.isDefault}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {branch.isDefault
                ? 'La sede principal no se puede desactivar: es donde caen los registros que no dicen de dónde son.'
                : 'Una sede inactiva deja de ofrecerse al crear, pero conserva su inventario y su equipo.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Nombrar coordinador.
 *
 * Se elige entre los usuarios que ya existen, nunca se crea uno aqui: el alta
 * es de Equipo y este paso solo cambia el sombrero. Se dejan fuera quienes ven
 * todas las sedes —un director no coordina una sola— porque la API lo rechaza
 * y es mejor no ofrecer lo que va a fallar.
 */
function CoordinatorModal({
  branch,
  current,
  onClose,
  onDone,
}: {
  branch: Branch;
  current: Agent | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [agentId, setAgentId] = useState(current?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const agents = useFetch<Agent[]>(
    (signal) => api.get<Agent[]>('/agents', { includeInactive: false }, signal),
    [],
  );

  const candidatos = (agents.data ?? []).filter(
    (agent) => !seesAllBranches(agent.role),
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/branches/${branch.id}/coordinator`, { agentId });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo asignar el coordinador.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Coordinación de ${branch.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!agentId || agentId === current?.id}
            onClick={() => void save()}
          >
            Nombrar coordinador
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Alert tone="warn">
          El usuario tiene que existir antes. Si aún no está,{' '}
          <Link to="/equipo" className="underline">
            créalo en Equipo
          </Link>{' '}
          y vuelve aquí.
        </Alert>

        {agents.loading && <Loading rows={2} />}
        {agents.error && <ErrorNote onRetry={agents.reload}>{agents.error}</ErrorNote>}

        {current && (
          <p className="text-sm">
            Ahora la coordina{' '}
            <strong className="font-medium">
              {current.firstName} {current.lastName ?? ''}
            </strong>
            . Nombrar a otro deja al primero como {ROLE_LABEL.AGENT.toLowerCase()} de
            su sede.
          </p>
        )}

        {agents.data && (
          <SelectField
            label="Usuario"
            required
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            hint="Pasa a coordinador de sede y queda asignado a esta oficina. Si no encuentras a alguien, pon «Todas las sedes» en el selector del menú."
          >
            <option value="">Elige un usuario</option>
            {candidatos.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.firstName} {agent.lastName ?? ''} — {ROLE_LABEL[agent.role]}
              </option>
            ))}
          </SelectField>
        )}
      </div>
    </Modal>
  );
}
