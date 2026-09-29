import { useState } from 'react';
import { Settings2, Trash2 } from 'lucide-react';
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
  type Role,
} from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { useBranch } from '../lib/branch';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Button,
  CheckField,
  ErrorNote,
  Field,
  Alert,
  CheckField as Casilla,
  Loading,
  Modal,
  PageBody,
  SectionHeading,
  SelectField,
} from '../components/ui';
import { number, relative, ROLE_LABEL } from '../lib/format';

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
  const { branches, branchId, seesAll, setBranchId } = useBranch();
  // La misma regla que la API: quien manda sobre un equipo define sus embudos.
  const puedeGestionar = can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER');
  const [gestionando, setGestionando] = useState(false);

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
          <>
            {/*
              La sede, aqui y no solo en el rail.

              Los embudos son de una sede: sin poder cambiarla desde la propia
              pantalla, la administracion tenia que ir al menu, cambiarla alli y
              volver. Es el MISMO estado que el selector del rail, no un segundo
              filtro que pueda contradecirlo.
            */}
            {seesAll && branches.length > 1 && (
              <SelectField
                label="Sede"
                className="min-w-[170px]"
                value={branchId ?? ''}
                onChange={(e) => setBranchId(e.target.value || null)}
              >
                <option value="">Todas las sedes</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectField>
            )}

            <SelectField
              label="Embudo"
              className="min-w-[190px]"
              value={pipelineId || (data?.kanban.pipeline.id ?? '')}
              onChange={(e) => {
                setPipelineId(e.target.value);
                setLimits({});
              }}
            >
              {(data?.pipelines ?? []).map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                  {pipeline.branchId === null ? ' · empresa' : ''}
                </option>
              ))}
            </SelectField>

            {/* Quien manda sobre un equipo define como trabaja ese equipo. */}
            {puedeGestionar && (
              <Button variant="outline" onClick={() => setGestionando(true)}>
                <Settings2 />
                Gestionar
              </Button>
            )}
          </>
        }
      />

      {gestionando && (
        <GestionEmbudos
          pipelines={data?.pipelines ?? []}
          onClose={() => setGestionando(false)}
          onDone={() => {
            setGestionando(false);
            setPipelineId('');
            reload();
          }}
        />
      )}

      <PageBody>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field
            label="Buscar"
            className="col-span-2"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Nombre, correo, teléfono o cédula"
          />

          {can('ADMIN', 'MANAGER', 'VIEWER') && (
            <SelectField
              label="Asesor"
              value={filters.assignedAgentId}
              onChange={(e) => set('assignedAgentId', e.target.value)}
            >
              <option value="">Todos</option>
              {(agents.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.firstName} {agent.lastName ?? ''}
                </option>
              ))}
            </SelectField>
          )}

          <SelectField
            label="Origen"
            value={filters.sourceId}
            onChange={(e) => set('sourceId', e.target.value)}
          >
            <option value="">Todos</option>
            {(sources.data ?? []).map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </SelectField>

          <div className="col-span-2 flex flex-wrap items-end gap-4 pb-2">
            <CheckField
              label="Sin contacto en 30 días"
              checked={filters.stale}
              onChange={(e) => set('stale', e.target.checked)}
            />
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

            <div className="flex items-start gap-3 overflow-x-auto pb-2">
              {data.kanban.stages.map((stage) => {
                const clients = data.byStage[stage.id] ?? [];
                const total = data.totals[stage.id] ?? 0;
                const share = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
                const isTarget = dropTarget === stage.id && dragging?.stageId !== stage.id;

                return (
                  <section
                    key={stage.id}
                    /*
                      `isTarget || undefined` y no `isTarget` a secas: React
                      pintaria `data-drop="false"`, que sigue casando con
                      `[data-drop]`, y todas las columnas quedarian resaltadas.
                    */
                    data-drop={isTarget || undefined}
                    className="flex max-h-[calc(100vh-16rem)] w-[268px] shrink-0 flex-col rounded-lg border bg-secondary/50 transition-colors data-drop:border-primary data-drop:bg-secondary"
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
                    <header className="border-b px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-sm font-medium">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {/* El color de la etapa lo manda la API: no hay clase
                              de Tailwind posible para un valor de runtime. */}
                          <i
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: stage.color }}
                            aria-hidden
                          />
                          <span className="truncate">{stage.name}</span>
                          {stage.isWon && <Badge tone="green">gana</Badge>}
                          {stage.isLost && <Badge tone="red">pierde</Badge>}
                        </span>
                        <span className="note tabular">{number(total)}</span>
                      </div>
                      {/* La barra dice cuánto pesa esta etapa sobre el total. */}
                      <div className="gauge mt-1.5">
                        <i style={{ width: `${share}%`, background: stage.color }} />
                      </div>
                    </header>

                    <div className="flex min-h-[60px] flex-col gap-1.5 overflow-y-auto p-2">
                      {clients.map((client) => (
                        <article
                          key={client.id}
                          data-dragging={dragging?.id === client.id || undefined}
                          className="cursor-grab rounded-md border bg-card p-2.5 transition-colors hover:border-input hover:shadow-sm data-dragging:opacity-40"
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
                          <span className="block text-sm leading-snug font-medium">
                            {client.firstName} {client.lastName ?? ''}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {client.cellPhone ?? client.email ?? 'sin contacto'}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {client.assignedAgent?.firstName ?? 'sin asesor'} ·{' '}
                            {client.lastContactedAt ? relative(client.lastContactedAt) : 'nunca'}
                          </span>
                          {client.types.length > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-1">
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
                        <span className="note px-0.5 py-2">
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
      </PageBody>
    </>
  );
}

/** Los perfiles a los que se le puede enseñar un embudo. */
const PERFILES: Role[] = ['DIRECTOR', 'COORDINATOR', 'AGENT', 'VIEWER'];

/**
 * Crear embudos y decidir quien los ve.
 *
 * Un embudo describe COMO trabaja un equipo —captacion no se parece a obra
 * nueva—, asi que lo define quien dirige ese equipo y no la administracion
 * central. Y decide a quien se lo enseña: quien no aparece en la lista no lo ve
 * ni sabe que existe, que es la diferencia entre acotar y esconder.
 *
 * Sin perfiles marcados, lo ve todo el mundo. Es lo que se espera cuando nadie
 * dice nada, y es como se comportan los embudos que ya existian.
 */
function GestionEmbudos({
  pipelines,
  onClose,
  onDone,
}: {
  pipelines: Pipeline[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user, can } = useAuth();
  const { branches, seesAll } = useBranch();
  const [nombre, setNombre] = useState('');
  const [sede, setSede] = useState<string>(seesAll ? '' : (user?.branchId ?? ''));
  const [perfiles, setPerfiles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const alternar = (rol: Role) =>
    setPerfiles((actuales) =>
      actuales.includes(rol)
        ? actuales.filter((r) => r !== rol)
        : [...actuales, rol],
    );

  async function crear() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/pipelines', {
        name: nombre.trim(),
        // Cadena vacia = de empresa, y eso solo lo puede pedir quien ve todas.
        branchId: sede === '' ? (seesAll ? null : undefined) : sede,
        visibleRoles: perfiles,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el embudo.');
    } finally {
      setBusy(false);
    }
  }

  async function retirar(pipeline: Pipeline) {
    if (!window.confirm(`¿Retirar el embudo "${pipeline.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/pipelines/${pipeline.id}`);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo retirar el embudo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Embudos" onClose={onClose} wide>
      {error && <Alert>{error}</Alert>}

      <div className="mb-5 overflow-hidden rounded-lg border">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="flex items-center justify-between gap-3 border-b px-3 py-2.5 text-sm last:border-0"
          >
            <div className="min-w-0">
              <strong className="block truncate font-medium">{pipeline.name}</strong>
              <span className="note">
                {pipeline.branchId === null
                  ? 'Toda la empresa'
                  : (branches.find((b) => b.id === pipeline.branchId)?.name ?? 'Su sede')}
                {' · '}
                {pipeline.visibleRoles.length === 0
                  ? 'Todos los perfiles'
                  : pipeline.visibleRoles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}
              </span>
            </div>
            {!pipeline.isDefault && can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER') && (
              <Button
                variant="outline"
                size="sm"
                loading={busy}
                onClick={() => void retirar(pipeline)}
                aria-label={`Retirar ${pipeline.name}`}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </div>

      <SectionHeading light="Nuevo" strong="embudo" as="h3" className="mb-3" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Captación Cañaveral"
        />
        {seesAll && (
          <SelectField
            label="Sede"
            hint="Sin sede queda disponible para toda la empresa."
            value={sede}
            onChange={(e) => setSede(e.target.value)}
          >
            <option value="">Toda la empresa</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      <div className="mt-4">
        <span className="micro-label mb-2 block text-muted-foreground">
          Quién lo ve
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERFILES.map((rol) => (
            <Casilla
              key={rol}
              label={ROLE_LABEL[rol] ?? rol}
              checked={perfiles.includes(rol)}
              onChange={() => alternar(rol)}
            />
          ))}
        </div>
        <p className="note mt-2">
          Sin marcar ninguno, lo ve todo el mundo de la sede.
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        <Button
          loading={busy}
          disabled={nombre.trim().length < 2}
          onClick={() => void crear()}
        >
          Crear embudo
        </Button>
      </div>
    </Modal>
  );
}
