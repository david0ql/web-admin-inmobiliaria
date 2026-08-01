import {
  api,
  type AgentWorkload,
  type CityInventory,
  type SourceRow,
  type TypeInventory,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { PageHeader } from '../components/Shell';
import { Badge, Card, Empty, ErrorNote, Loading } from '../components/ui';
import { ROLE_LABEL, area, moneyShort, number } from '../lib/format';

interface FunnelRow {
  pipeline: string;
  stage: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  total: number;
  new_last_30d: number;
  avg_days_in_stage: string;
}

interface ReportsData {
  byCity: CityInventory[];
  byType: TypeInventory[];
  funnel: FunnelRow[];
  sources: SourceRow[];
  agents: AgentWorkload[];
}

export function Reports() {
  const { data, error, loading, reload } = useFetch<ReportsData>(async (signal) => {
    const [inventory, funnel, sources, agents] = await Promise.all([
      api.get<{ byCity: CityInventory[]; byType: TypeInventory[] }>(
        '/analytics/inventory',
        undefined,
        signal,
      ),
      api.get<FunnelRow[]>('/analytics/funnel', undefined, signal),
      api.get<SourceRow[]>('/analytics/sources', undefined, signal),
      api.get<AgentWorkload[]>('/analytics/agents', undefined, signal).catch(() => []),
    ]);
    return { ...inventory, funnel, sources, agents };
  }, []);

  const maxFunnel = Math.max(1, ...(data?.funnel.map((row) => row.total) ?? [1]));

  return (
    <>
      <PageHeader eyebrow="Análisis" title="Informes" />

      <div className="content stack">
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && <Loading rows={6} />}

        {data && (
          <>
            <Card
              title="Origen de los clientes"
              action={<span className="note">Qué canal trae los que convierten</span>}
              flush
            >
              {data.sources.length === 0 ? (
                <Empty title="Sin clientes todavía" />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th className="num">Clientes</th>
                        <th className="num">Convertidos</th>
                        <th className="num">Perdidos</th>
                        <th className="num">Conversión</th>
                        <th className="num">Últimos 30 d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources.map((row) => (
                        <tr key={row.source}>
                          <td>
                            {row.source}{' '}
                            {row.paid && (
                              <Badge tone="amber" >de pago</Badge>
                            )}
                          </td>
                          <td className="num">{number(row.total)}</td>
                          <td className="num">{number(row.won)}</td>
                          <td className="num">{number(row.lost)}</td>
                          <td className="num">
                            {row.conversion_rate ? `${row.conversion_rate} %` : '—'}
                          </td>
                          <td className="num">{number(row.new_last_30d)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              title="Embudo por etapa"
              action={<span className="note">Días medios que llevan parados en cada una</span>}
              flush
            >
              <div className="card-body stack" style={{ gap: 10 }}>
                {data.funnel.map((row) => (
                  <div key={`${row.pipeline}-${row.stage}`}>
                    <div className="row spread" style={{ gap: 10 }}>
                      <span className="row" style={{ gap: 7, fontSize: 'var(--t-small)' }}>
                        <i className="dot" style={{ background: row.color }} />
                        <strong>{row.stage}</strong>
                        <span className="note">{row.pipeline}</span>
                        {row.is_won && <Badge tone="green">gana</Badge>}
                        {row.is_lost && <Badge tone="red">pierde</Badge>}
                      </span>
                      <span className="figure small">
                        {number(row.total)}
                        <span className="note"> · {row.avg_days_in_stage} d</span>
                      </span>
                    </div>
                    {/* Barra proporcional al mayor: se compara el peso de las
                        etapas de un vistazo, sin leer las cifras. */}
                    <div className="board-gauge" style={{ marginTop: 6 }}>
                      <i
                        style={{
                          width: `${(row.total / maxFunnel) * 100}%`,
                          background: row.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
              <Card title="Inventario por ciudad" flush>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Ciudad</th>
                        <th className="num">Total</th>
                        <th className="num">Disponibles</th>
                        <th className="num">Precio medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCity.map((row) => (
                        <tr key={row.city_id}>
                          <td>{row.city}</td>
                          <td className="num">{number(row.total)}</td>
                          <td className="num">{number(row.available)}</td>
                          <td className="num">{moneyShort(row.avg_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Inventario por tipo" flush>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th className="num">Total</th>
                        <th className="num">Precio medio</th>
                        <th className="num">Área media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byType.map((row) => (
                        <tr key={row.type_id}>
                          <td>{row.type}</td>
                          <td className="num">{number(row.total)}</td>
                          <td className="num">{moneyShort(row.avg_price)}</td>
                          <td className="num">{area(Number(row.avg_area))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {data.agents.length > 0 && (
              <Card title="Carga por asesor" flush>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Asesor</th>
                        <th>Perfil</th>
                        <th className="num">Inmuebles</th>
                        <th className="num">Clientes</th>
                        <th className="num">Abiertos</th>
                        <th className="num">Convertidos</th>
                        <th className="num">Citas 7 d</th>
                        <th className="num">Gestiones 30 d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agents.map((row) => (
                        <tr key={row.agent_id}>
                          <td>
                            {row.agent}
                            {row.status !== 'ACTIVE' && (
                              <>
                                {' '}
                                <Badge tone="red">inactivo</Badge>
                              </>
                            )}
                          </td>
                          <td className="note">{ROLE_LABEL[row.role] ?? row.role}</td>
                          <td className="num">{number(row.properties)}</td>
                          <td className="num">{number(row.clients)}</td>
                          <td className="num">{number(row.open_clients)}</td>
                          <td className="num">{number(row.won_clients)}</td>
                          <td className="num">{number(row.upcoming_appointments)}</td>
                          <td className="num">{number(row.activities_30d)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
