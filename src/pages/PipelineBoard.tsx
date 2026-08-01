import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  api,
  type Agent,
  type Client,
  type Kanban,
  type LeadSource,
  type Page,
  type Pipeline,
} from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import { Badge, Button, ErrorNote, Loading } from '../components/ui';
import { number, relative } from '../lib/format';

interface BoardData {
  pipelines: Pipeline[];
  kanban: Kanban;
  /** Clientes por etapa: cada columna trae los suyos. */
  byStage: Record<string, Client[]>;
  /** Total por etapa ya filtrado, que no coincide con el del embudo entero. */
  totals: Record<string, number>;
}

interface Filters {
  q: string;
  assignedAgentId: string;
  sourceId: string;
  stale: boolean;
}

const EMPTY: Filters = { q: '', assignedAgentId: '', sourceId: '', stale: false };

/** Tarjetas por columna. Con 4.173 clientes en "Nuevo" el tablero no se pinta. */
const PAGE_SIZE = 25;

/** Sin contacto desde hace 30 días: el corte con que se revisa la cartera. */
function staleCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function PipelineBoard() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [pipelineId, setPipelineId] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<Client | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounced(filters.q);
  const editable = can('ADMIN', 'MANAGER', 'AGENT');

  const agents = useFetch<Agent[]>((signal) => api.get<Agent[]>('/agents', undefined, signal), []);
  const sources = useFetch<LeadSource[]>(
    (signal) => api.get<LeadSource[]>('/clients/sources', undefined, signal),
    [],
  );

  const { data, error: loadError, loading, reload } = useFetch<BoardData>(
    async (signal) => {
      const pipelines = await api.get<Pipeline[]>('/pipelines', undefined, signal);
      const target = pipelineId || pipelines.find((p) => p.isDefault)?.id || pipelines[0]?.id;
      const kanban = await api.get<Kanban>('/pipelines/kanban', { pipelineId: target }, signal);

      const shared = {
        q: debouncedQuery || undefined,
        assignedAgentId: filters.assignedAgentId || undefined,
        sourceId: filters.sourceId || undefined,
        staleSince: filters.stale ? staleCutoff() : undefined,
      };

      // Una consulta por etapa y no una página global del embudo: con 4.173
      // clientes en "Nuevo", cualquier tope global deja vacías las etapas
      // pequeñas aunque tengan gente. Además así cada columna reporta su
      // propio total, que con filtros ya no es el del embudo.
      const pages = await Promise.all(
        kanban.stages.map((stage) =>
          api.get<Page<Client>>(
            '/clients',
            { ...shared, stageId: stage.id, limit: limits[stage.id] ?? PAGE_SIZE },
            signal,
          ),
        ),
      );

      const byStage: Record<string, Client[]> = {};
      const totals: Record<string, number> = {};
      kanban.stages.forEach((stage, index) => {
        byStage[stage.id] = pages[index].data;
        totals[stage.id] = pages[index].meta.total;
      });

      return { pipelines, kanban, byStage, totals };
    },
    [
      pipelineId,
      debouncedQuery,
      filters.assignedAgentId,
      filters.sourceId,
      filters.stale,
      JSON.stringify(limits),
    ],
  );

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setLimits({});
  }

  async function moveTo(stageId: string) {
    if (!dragging || dragging.stageId === stageId) {
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const client = dragging;
    setDragging(null);
    setDropTarget(null);
    setError(null);
    try {
      await api.post(`/clients/${client.id}/stage`, { stageId });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo mover al cliente de etapa.');
    }
  }

  const activeFilters = [
    filters.q,
    filters.assignedAgentId,
    filters.sourceId,
    filters.stale ? '1' : '',
  ].filter(Boolean).length;

  const grandTotal = Object.values(data?.totals ?? {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow="Embudo comercial"
        title={data?.kanban.pipeline.name ?? 'Embudo'}
        actions={
          <label className="field" style={{ minWidth: 190 }}>
            <span>Embudo</span>
            <select
              className="select"
              value={pipelineId || (data?.kanban.pipeline.id ?? '')}
              onChange={(e) => {
                setPipelineId(e.target.value);
                setLimits({});
              }}
            >
              {(data?.pipelines ?? []).map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="content stack">
        <div className="filters">
          <label className="field" style={{ flex: '1 1 220px' }}>
            <span>Buscar</span>
            <input
              className="input"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Nombre, correo, teléfono o cédula"
            />
          </label>

          {can('ADMIN', 'MANAGER', 'VIEWER') && (
            <label className="field" style={{ flex: '0 1 180px' }}>
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

          <label className="field" style={{ flex: '0 1 180px' }}>
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

          <div className="row" style={{ gap: 12, paddingBottom: 8 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={filters.stale}
                onChange={(e) => set('stale', e.target.checked)}
              />
              Sin contacto en 30 días
            </label>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
                Limpiar {activeFilters}
              </Button>
            )}
          </div>
        </div>

        {loadError && <ErrorNote onRetry={reload}>{loadError}</ErrorNote>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && (
          <>
            <p className="note">
              {editable
                ? 'Arrastra una tarjeta a otra columna para mover al cliente de etapa.'
                : 'Vista de solo lectura.'}
              {activeFilters > 0 && ` · ${number(grandTotal)} clientes coinciden con el filtro`}
            </p>

            <div className="board">
              {data.kanban.stages.map((stage) => {
                const clients = data.byStage[stage.id] ?? [];
                const total = data.totals[stage.id] ?? 0;
                const share = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
                const isTarget = dropTarget === stage.id && dragging?.stageId !== stage.id;

                return (
                  <section
                    key={stage.id}
                    className={`board-col ${isTarget ? 'drop' : ''}`.trim()}
                    onDragOver={(e) => {
                      if (!editable || !dragging) return;
                      e.preventDefault();
                      setDropTarget(stage.id);
                    }}
                    onDragLeave={() => setDropTarget((prev) => (prev === stage.id ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      void moveTo(stage.id);
                    }}
                  >
                    <header className="board-head">
                      <div className="board-title">
                        <span className="row" style={{ gap: 6, minWidth: 0 }}>
                          <i className="dot" style={{ background: stage.color }} />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {stage.name}
                          </span>
                          {stage.isWon && <Badge tone="green">gana</Badge>}
                          {stage.isLost && <Badge tone="red">pierde</Badge>}
                        </span>
                        <span className="figure note">{number(total)}</span>
                      </div>
                      {/* La barra es una cota: su longitud dice cuánto pesa esta
                          etapa sobre el total mostrado. */}
                      <div className="board-gauge">
                        <i style={{ width: `${share}%`, background: stage.color }} />
                      </div>
                    </header>

                    <div className="board-list">
                      {clients.map((client) => (
                        <article
                          key={client.id}
                          className={`lead ${dragging?.id === client.id ? 'dragging' : ''}`.trim()}
                          draggable={editable}
                          onDragStart={() => setDragging(client)}
                          onDragEnd={() => {
                            setDragging(null);
                            setDropTarget(null);
                          }}
                          onClick={() => navigate(`/clientes/${client.id}`)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') navigate(`/clientes/${client.id}`);
                          }}
                        >
                          <span className="lead-name">
                            {client.firstName} {client.lastName ?? ''}
                          </span>
                          <span className="lead-meta">
                            {client.cellPhone ?? client.email ?? 'sin contacto'}
                          </span>
                          <span className="lead-meta">
                            {client.assignedAgent?.firstName ?? 'sin asesor'} ·{' '}
                            {client.lastContactedAt ? relative(client.lastContactedAt) : 'nunca'}
                          </span>
                          {client.types.length > 0 && (
                            <span className="row row-wrap" style={{ gap: 4, marginTop: 6 }}>
                              {client.types.slice(0, 2).map((type) => (
                                <Badge key={type.id}>{type.name}</Badge>
                              ))}
                            </span>
                          )}
                        </article>
                      ))}

                      {total > clients.length && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setLimits((prev) => ({
                              ...prev,
                              [stage.id]: (prev[stage.id] ?? PAGE_SIZE) + PAGE_SIZE,
                            }))
                          }
                        >
                          Ver {Math.min(PAGE_SIZE, total - clients.length)} más de{' '}
                          {number(total - clients.length)}
                        </Button>
                      )}

                      {total === 0 && (
                        <span className="note" style={{ padding: '8px 2px' }}>
                          {activeFilters > 0 ? 'Nadie coincide' : 'Vacía'}
                        </span>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
