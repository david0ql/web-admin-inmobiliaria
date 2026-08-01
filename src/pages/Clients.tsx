import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  api,
  type Agent,
  type Catalogs,
  type Client,
  type LeadSource,
  type Page,
  type Pipeline,
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
  Pager,
  SelectField,
  TextareaField,
} from '../components/ui';
import { relative } from '../lib/format';

interface Filters {
  q: string;
  pipelineId: string;
  stageId: string;
  sourceId: string;
  assignedAgentId: string;
  openOnly: boolean;
  staleSince: string;
}

const EMPTY: Filters = {
  q: '',
  pipelineId: '',
  stageId: '',
  sourceId: '',
  assignedAgentId: '',
  openOnly: false,
  staleSince: '',
};

export function Clients() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debouncedQuery = useDebounced(filters.q);

  const pipelines = useFetch<Pipeline[]>(
    (signal) => api.get<Pipeline[]>('/pipelines', undefined, signal),
    [],
  );
  const sources = useFetch<LeadSource[]>(
    (signal) => api.get<LeadSource[]>('/clients/sources', undefined, signal),
    [],
  );
  const agents = useFetch<Agent[]>((signal) => api.get<Agent[]>('/agents', undefined, signal), []);

  const { data, error, loading, reload } = useFetch<Page<Client>>(
    (signal) =>
      api.get<Page<Client>>(
        '/clients',
        {
          q: debouncedQuery || undefined,
          pipelineId: filters.pipelineId || undefined,
          stageId: filters.stageId || undefined,
          sourceId: filters.sourceId || undefined,
          assignedAgentId: filters.assignedAgentId || undefined,
          openOnly: filters.openOnly ? 'true' : undefined,
          staleSince: filters.staleSince || undefined,
          page,
          limit: 30,
        },
        signal,
      ),
    [
      debouncedQuery,
      filters.pipelineId,
      filters.stageId,
      filters.sourceId,
      filters.assignedAgentId,
      filters.openOnly,
      filters.staleSince,
      page,
    ],
  );

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const selectedPipeline = pipelines.data?.find((p) => p.id === filters.pipelineId);

  /** Hace 30 días: el corte con el que la agencia mira su cartera olvidada. */
  function staleCutoff() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }

  return (
    <>
      <PageHeader
        eyebrow="Cartera"
        title="Clientes"
        actions={
          can('ADMIN', 'MANAGER', 'AGENT') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Nuevo cliente
            </Button>
          )
        }
      />

      <div className="content stack">
        <div className="filters">
          <label className="field" style={{ flex: '1 1 240px' }}>
            <span>Buscar</span>
            <input
              className="input"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Nombre, correo, teléfono o cédula"
            />
          </label>

          <label className="field" style={{ flex: '0 1 180px' }}>
            <span>Embudo</span>
            <select
              className="select"
              value={filters.pipelineId}
              onChange={(e) => {
                set('pipelineId', e.target.value);
                set('stageId', '');
              }}
            >
              <option value="">Todos</option>
              {(pipelines.data ?? []).map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: '0 1 170px' }}>
            <span>Etapa</span>
            <select
              className="select"
              value={filters.stageId}
              onChange={(e) => set('stageId', e.target.value)}
              disabled={!selectedPipeline}
            >
              <option value="">Todas</option>
              {(selectedPipeline?.stages ?? []).map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: '0 1 170px' }}>
            <span>Origen</span>
            <select
              className="select"
              value={filters.sourceId}
              onChange={(e) => set('sourceId', e.target.value)}
            >
              <option value="">Todos</option>
              {(sources.data ?? []).map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          {can('ADMIN', 'MANAGER', 'VIEWER') && (
            <label className="field" style={{ flex: '0 1 170px' }}>
              <span>Asesor</span>
              <select
                className="select"
                value={filters.assignedAgentId}
                onChange={(e) => set('assignedAgentId', e.target.value)}
              >
                <option value="">Todos</option>
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.firstName} {agent.lastName ?? ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="row" style={{ gap: 12, paddingBottom: 8 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={filters.openOnly}
                onChange={(e) => set('openOnly', e.target.checked)}
              />
              Solo abiertos
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(filters.staleSince)}
                onChange={(e) => set('staleSince', e.target.checked ? staleCutoff() : '')}
              />
              Sin contacto en 30 días
            </label>
          </div>
        </div>

        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={8} />}

        {data && (
          <Card flush>
            {data.data.length === 0 ? (
              <Empty
                title="Ningún cliente coincide"
                action={
                  <Button onClick={() => setFilters(EMPTY)}>Quitar los filtros</Button>
                }
              >
                Prueba con otro embudo o busca por teléfono.
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th className="hide-sm">Contacto</th>
                        <th>Etapa</th>
                        <th className="hide-sm">Origen</th>
                        <th className="hide-sm">Asesor</th>
                        <th className="num">Último contacto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((client) => (
                        <tr
                          key={client.id}
                          className="clickable"
                          onClick={() => navigate(`/clientes/${client.id}`)}
                        >
                          <td>
                            <strong>
                              {client.firstName} {client.lastName ?? ''}
                            </strong>
                            {client.types.length > 0 && (
                              <div className="note" style={{ marginTop: 2 }}>
                                {client.types.map((t) => t.name).join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="hide-sm">
                            <span className="figure small">
                              {client.cellPhone ?? client.phone ?? '—'}
                            </span>
                            {client.email && (
                              <div className="note" style={{ marginTop: 2 }}>
                                {client.email}
                              </div>
                            )}
                          </td>
                          <td>
                            <Badge color={client.stage.color}>{client.stage.name}</Badge>
                          </td>
                          <td className="hide-sm">{client.source?.name ?? '—'}</td>
                          <td className="hide-sm">{client.assignedAgent?.firstName ?? '—'}</td>
                          <td className="num small muted">
                            {client.lastContactedAt ? relative(client.lastContactedAt) : 'nunca'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={data.meta.page}
                  pages={data.meta.pages}
                  total={data.meta.total}
                  unit="clientes"
                  onPage={setPage}
                />
              </>
            )}
          </Card>
        )}
      </div>

      {creating && (
        <NewClientModal
          onClose={() => setCreating(false)}
          onCreated={(client) => navigate(`/clientes/${client.id}`)}
        />
      )}
    </>
  );
}

function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (client: Client) => void;
}) {
  const catalogs = useFetch<Catalogs>(
    (signal) => api.get<Catalogs>('/catalogs/bootstrap', undefined, signal),
    [],
  );
  const pipelines = useFetch<Pipeline[]>(
    (signal) => api.get<Pipeline[]>('/pipelines', undefined, signal),
    [],
  );
  const sources = useFetch<LeadSource[]>(
    (signal) => api.get<LeadSource[]>('/clients/sources', undefined, signal),
    [],
  );

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    cellPhone: '',
    email: '',
    typeIds: [] as number[],
    pipelineId: '',
    sourceId: '',
    requirement: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Client>('/clients', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        cellPhone: form.cellPhone.trim() || undefined,
        email: form.email.trim() || undefined,
        typeIds: form.typeIds.length ? form.typeIds : undefined,
        pipelineId: form.pipelineId || undefined,
        sourceId: form.sourceId || undefined,
        requirement: form.requirement.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el cliente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nuevo cliente"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!form.firstName.trim()}
            onClick={() => void save()}
          >
            Crear cliente
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}

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
            label="Celular"
            value={form.cellPhone}
            onChange={(e) => setForm({ ...form, cellPhone: e.target.value })}
            placeholder="+57 300 000 0000"
          />
          <Field
            label="Correo"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <SelectField
            label="Embudo"
            value={form.pipelineId}
            onChange={(e) => setForm({ ...form, pipelineId: e.target.value })}
            hint="Entra en la primera etapa"
          >
            <option value="">Por defecto</option>
            {(pipelines.data ?? []).map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Origen"
            value={form.sourceId}
            onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
          >
            <option value="">Sin especificar</option>
            {(sources.data ?? []).map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="field">
          <label>Tipo de cliente</label>
          <div className="row row-wrap" style={{ gap: 6 }}>
            {(catalogs.data?.clientTypes ?? []).map((type) => {
              const active = form.typeIds.includes(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setForm({
                      ...form,
                      typeIds: active
                        ? form.typeIds.filter((id) => id !== type.id)
                        : [...form.typeIds, type.id],
                    })
                  }
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <Badge tone={active ? 'green' : 'neutral'}>{type.name}</Badge>
                </button>
              );
            })}
          </div>
        </div>

        <TextareaField
          label="Qué busca"
          value={form.requirement}
          onChange={(e) => setForm({ ...form, requirement: e.target.value })}
          placeholder="Apartamento de 3 alcobas en Cañaveral, hasta 450 millones."
        />
      </div>
    </Modal>
  );
}
