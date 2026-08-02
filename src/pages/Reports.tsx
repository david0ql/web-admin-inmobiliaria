import {
  api,
  type AgentWorkload,
  type CityInventory,
  type SourceRow,
  type TypeInventory,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  Loading,
  PageBody,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';
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

      <PageBody>
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
                <div className="p-5">
                  <Empty title="Sin clientes todavía" />
                </div>
              ) : (
                <Table>
                    <THead>
                      <tr>
                        <Th>Canal</Th>
                        <Th num>Clientes</Th>
                        <Th num>Convertidos</Th>
                        <Th num>Perdidos</Th>
                        <Th num>Conversión</Th>
                        <Th num>Últimos 30 d</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {data.sources.map((row) => (
                        <Tr key={row.source}>
                          <Td>
                            {row.source} {row.paid && <Badge tone="amber">de pago</Badge>}
                          </Td>
                          <Td num>{number(row.total)}</Td>
                          <Td num>{number(row.won)}</Td>
                          <Td num>{number(row.lost)}</Td>
                          <Td num>{row.conversion_rate ? `${row.conversion_rate} %` : '—'}</Td>
                          <Td num>{number(row.new_last_30d)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              )}
            </Card>

            <Card
              title="Embudo por etapa"
              action={<span className="note">Días medios que llevan parados en cada una</span>}
              flush
            >
              <div className="flex flex-col gap-2.5 p-5">
                {data.funnel.map((row) => (
                  <div key={`${row.pipeline}-${row.stage}`}>
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-sm">
                        {/* El color de la etapa lo manda la API: Tailwind no
                            puede generar una clase para un valor que no existe
                            en build time, asi que va por `style`. */}
                        <i
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: row.color }}
                          aria-hidden
                        />
                        <strong className="font-medium">{row.stage}</strong>
                        <span className="note">{row.pipeline}</span>
                        {row.is_won && <Badge tone="green">gana</Badge>}
                        {row.is_lost && <Badge tone="red">pierde</Badge>}
                      </span>
                      <span className="tabular text-sm whitespace-nowrap">
                        {number(row.total)}
                        <span className="note"> · {row.avg_days_in_stage} d</span>
                      </span>
                    </div>
                    {/* Barra proporcional al mayor: se compara el peso de las
                        etapas de un vistazo, sin leer las cifras. */}
                    <div className="gauge mt-1.5">
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

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Inventario por ciudad" flush>
                <Table>
                    <THead>
                      <tr>
                        <Th>Ciudad</Th>
                        <Th num>Total</Th>
                        <Th num>Disponibles</Th>
                        <Th num>Precio medio</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {data.byCity.map((row) => (
                        <Tr key={row.city_id}>
                          <Td>{row.city}</Td>
                          <Td num>{number(row.total)}</Td>
                          <Td num>{number(row.available)}</Td>
                          <Td num>{moneyShort(row.avg_price)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              </Card>

              <Card title="Inventario por tipo" flush>
                <Table>
                    <THead>
                      <tr>
                        <Th>Tipo</Th>
                        <Th num>Total</Th>
                        <Th num>Precio medio</Th>
                        <Th num>Área media</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {data.byType.map((row) => (
                        <Tr key={row.type_id}>
                          <Td>{row.type}</Td>
                          <Td num>{number(row.total)}</Td>
                          <Td num>{moneyShort(row.avg_price)}</Td>
                          <Td num>{area(Number(row.avg_area))}</Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              </Card>
            </div>

            {data.agents.length > 0 && (
              <Card title="Carga por asesor" flush>
                <Table>
                    <THead>
                      <tr>
                        <Th>Asesor</Th>
                        <Th>Perfil</Th>
                        <Th num>Inmuebles</Th>
                        <Th num>Clientes</Th>
                        <Th num>Abiertos</Th>
                        <Th num>Convertidos</Th>
                        <Th num>Citas 7 d</Th>
                        <Th num>Gestiones 30 d</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {data.agents.map((row) => (
                        <Tr key={row.agent_id}>
                          <Td>
                            {row.agent}
                            {row.status !== 'ACTIVE' && (
                              <>
                                {' '}
                                <Badge tone="red">inactivo</Badge>
                              </>
                            )}
                          </Td>
                          <Td className="note">{ROLE_LABEL[row.role] ?? row.role}</Td>
                          <Td num>{number(row.properties)}</Td>
                          <Td num>{number(row.clients)}</Td>
                          <Td num>{number(row.open_clients)}</Td>
                          <Td num>{number(row.won_clients)}</Td>
                          <Td num>{number(row.upcoming_appointments)}</Td>
                          <Td num>{number(row.activities_30d)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              </Card>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
