import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CoverageRow } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { NEEDS_LOCATIONS, type PortalConnection } from '../lib/portals';
import { ConnectionModal } from '../components/portals/ConnectionModal';
import { LocationsModal } from '../components/portals/LocationsModal';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  PageBody,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';
import { number } from '../lib/format';

interface Gap {
  id: string;
  code: string;
  title: string;
}

interface PortalsData {
  coverage: CoverageRow[];
  gaps: Gap[];
}

export function Portals() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useFetch<PortalsData>(async (signal) => {
    const [coverage, gaps] = await Promise.all([
      api.get<CoverageRow[]>('/publishing/coverage', undefined, signal),
      api.get<Gap[]>('/publishing/gaps', undefined, signal),
    ]);
    return { coverage, gaps };
  }, []);

  const maxTotal = Math.max(1, ...(data?.coverage.map((row) => row.total) ?? [1]));
  const paidPortals = data?.coverage.filter((row) => row.paid).length ?? 0;

  return (
    <>
      <PageHeader eyebrow="Difusión" title="Portales" />

      <PageBody>
        {can('ADMIN') && <Connections />}
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && <Loading rows={5} />}

        {data && (
          <>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
              <Stat
                label="Portales en uso"
                value={number(data.coverage.length)}
                note={`${paidPortals} de pago`}
              />
              <Stat
                label="Anuncios publicados"
                value={number(data.coverage.reduce((sum, row) => sum + row.total, 0))}
                note="suma de todos los portales"
              />
              <Stat
                label="Inmuebles sin publicar"
                value={number(data.gaps.length)}
                note={data.gaps.length ? 'activos y sin difusión' : 'todo publicado'}
                tone={data.gaps.length ? 'amber' : 'green'}
              />
            </div>

            <Card
              title="Cobertura por portal"
              action={<span className="note">Cuántos de tus inmuebles hay en cada uno</span>}
              flush
            >
              {data.coverage.length === 0 ? (
                <div className="p-5">
                  <Empty title="Ningún inmueble publicado">
                    Abre la ficha de un inmueble y elige en qué portales debe aparecer.
                  </Empty>
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-5">
                  {data.coverage.map((row) => (
                    <div key={row.portalId}>
                      <div className="flex items-center justify-between gap-2.5">
                        <span className="flex items-center gap-1.5 text-sm">
                          <strong className="font-medium">{row.portal}</strong>
                          {row.paid && <Badge tone="amber">de pago</Badge>}
                        </span>
                        <span className="tabular text-sm whitespace-nowrap">
                          {number(row.total)}
                          {row.published > 0 && (
                            <span className="note"> · {number(row.published)} confirmados</span>
                          )}
                        </span>
                      </div>
                      <div className="gauge mt-1.5">
                        <i
                          className={row.paid ? 'bg-amber-600' : 'bg-emerald-600'}
                          style={{ width: `${(row.total / maxTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title={`Sin publicar · ${data.gaps.length}`}
              action={<span className="note">Activos que no están en ningún portal</span>}
              flush
            >
              {data.gaps.length === 0 ? (
                <div className="p-5">
                  <Empty title="Todo publicado">
                    Cada inmueble activo está al menos en un portal.
                  </Empty>
                </div>
              ) : (
                <Table>
                    <THead>
                      <tr>
                        <Th>Código</Th>
                        <Th>Inmueble</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {data.gaps.map((gap) => (
                        <Tr key={gap.id}>
                          <Td className="tabular">{gap.code}</Td>
                          <Td>
                            <Link to={`/inmuebles/${gap.id}`} className="hover:underline">
                              {gap.title}
                            </Link>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              )}
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * Las integraciones propias con cada portal. Solo administracion: aqui viven
 * las credenciales.
 */
function Connections() {
  const { data, error, loading, reload } = useFetch<PortalConnection[]>(
    (signal) => api.get<PortalConnection[]>('/publishing/connections', undefined, signal),
    [],
  );
  const [editing, setEditing] = useState<PortalConnection | null>(null);
  const [mapping, setMapping] = useState<PortalConnection | null>(null);

  return (
    <Card
      title="Conexiones"
      action={<span className="note">Credenciales propias con cada portal</span>}
      flush
    >
      {error && (
        <div className="p-5">
          <ErrorNote onRetry={reload}>{error}</ErrorNote>
        </div>
      )}
      {loading && !data && (
        <div className="p-5">
          <Loading rows={4} />
        </div>
      )}
      {data && (
        <Table>
          <THead>
            <tr>
              <Th>Portal</Th>
              <Th>Estado</Th>
              <Th>Ultima prueba</Th>
              <Th className="w-[1%]" />
            </tr>
          </THead>
          <TBody>
            {data.map((conn) => {
              const missing = conn.credentials.some((f) => f.required && !f.filled);
              return (
                <Tr key={conn.portalId}>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <strong className="font-medium">{conn.portal.name}</strong>
                      {conn.mode === 'feed' && <Badge tone="blue">Feed XML</Badge>}
                      {conn.sandbox && <Badge tone="amber">Pruebas</Badge>}
                    </span>
                  </Td>
                  <Td>
                    {conn.enabled ? (
                      <Badge tone="green">Conectado</Badge>
                    ) : missing ? (
                      <Badge tone="red">Faltan credenciales</Badge>
                    ) : (
                      <Badge>Apagado</Badge>
                    )}
                  </Td>
                  <Td className="text-sm text-muted-foreground">
                    {conn.lastCheckAt ? (
                      <span className={conn.lastCheckOk ? '' : 'text-red-700'}>
                        {conn.lastCheckOk ? 'Correcta' : 'Fallida'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1.5">
                      {NEEDS_LOCATIONS.has(conn.connector) && (
                        <Button size="sm" variant="outline" onClick={() => setMapping(conn)}>
                          Barrios
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEditing(conn)}>
                        Configurar
                      </Button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
      {editing && (
        <ConnectionModal
          connection={editing}
          onClose={() => setEditing(null)}
          onSaved={() => reload()}
        />
      )}
      {mapping && <LocationsModal connection={mapping} onClose={() => setMapping(null)} />}
    </Card>
  );
}
