import { Link } from 'react-router-dom';
import { api, type CoverageRow } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { PageHeader } from '../components/Shell';
import { Badge, Card, Empty, ErrorNote, Loading, Stat } from '../components/ui';
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

      <div className="content stack">
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && <Loading rows={5} />}

        {data && (
          <>
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
            >
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
                <Empty title="Ningún inmueble publicado">
                  Abre la ficha de un inmueble y elige en qué portales debe aparecer.
                </Empty>
              ) : (
                <div className="card-body stack" style={{ gap: 11 }}>
                  {data.coverage.map((row) => (
                    <div key={row.portalId}>
                      <div className="row spread" style={{ gap: 10 }}>
                        <span className="row" style={{ gap: 7, fontSize: 'var(--t-small)' }}>
                          <strong>{row.portal}</strong>
                          {row.paid && <Badge tone="amber">de pago</Badge>}
                        </span>
                        <span className="figure small">
                          {number(row.total)}
                          {row.published > 0 && (
                            <span className="note"> · {number(row.published)} confirmados</span>
                          )}
                        </span>
                      </div>
                      <div className="board-gauge" style={{ marginTop: 6 }}>
                        <i
                          style={{
                            width: `${(row.total / maxTotal) * 100}%`,
                            background: row.paid ? 'var(--amber)' : 'var(--green)',
                          }}
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
                <Empty title="Todo publicado">
                  Cada inmueble activo está al menos en un portal.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Inmueble</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.gaps.map((gap) => (
                        <tr key={gap.id}>
                          <td className="figure">{gap.code}</td>
                          <td>
                            <Link to={`/inmuebles/${gap.id}`}>{gap.title}</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
