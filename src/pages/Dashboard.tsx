import { Link } from 'react-router-dom';
import { api, type Appointment, type AttentionRow, type CityInventory, type Overview } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
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
import { APPOINTMENT_TYPE_LABEL, money, moneyShort, number, time } from '../lib/format';

interface DashboardData {
  overview: Overview;
  today: Appointment[];
  byCity: CityInventory[];
  attention: AttentionRow[];
}

export function Dashboard() {
  const { user } = useAuth();

  const { data, error, loading, reload } = useFetch<DashboardData>(async (signal) => {
    const [overview, today, inventory, attention] = await Promise.all([
      api.get<Overview>('/analytics/overview', undefined, signal),
      api.get<Appointment[]>('/calendar/today', undefined, signal),
      api.get<{ byCity: CityInventory[] }>('/analytics/inventory', undefined, signal),
      api.get<AttentionRow[]>('/analytics/attention', undefined, signal),
    ]);
    return { overview, today, byCity: inventory.byCity, attention };
  }, []);

  const firstName = user?.firstName ?? '';

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(new Date())}
        title={`Hola, ${firstName}`}
      />

      <PageBody>
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && <Loading rows={4} />}

        {data && (
          <>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
              <Stat
                label="Inventario"
                value={number(data.overview.inventory.total)}
                note={`${number(data.overview.inventory.available)} disponibles`}
                tone="green"
              />
              <Stat
                label="Valor en cartera"
                value={moneyShort(data.overview.inventory.portfolio_value)}
                note={`media ${moneyShort(data.overview.inventory.avg_sale_price)}`}
              />
              <Stat
                label="Clientes abiertos"
                value={number(data.overview.clients.open)}
                note={
                  data.overview.clients.stale > 0
                    ? `${number(data.overview.clients.stale)} sin contacto`
                    : 'todos al día'
                }
                tone={data.overview.clients.stale > 0 ? 'amber' : 'green'}
              />
              <Stat
                label="Citas esta semana"
                value={number(data.overview.appointments.upcoming_7d)}
                note={`${number(data.overview.appointments.today)} hoy`}
              />
              <Stat
                label="Nuevos en 30 días"
                value={number(data.overview.clients.new_last_30d)}
                note={`${number(data.overview.clients.won)} convertidos`}
                tone="green"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <Card
                title="Agenda de hoy"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/agenda">Ver calendario</Link>
                  </Button>
                }
                flush
              >
                {data.today.length === 0 ? (
                  <div className="p-5">
                    <Empty title="Sin citas hoy">
                      Cuando agendes una visita aparecerá aquí, con su hora y el inmueble.
                    </Empty>
                  </div>
                ) : (
                  <Table>
                      <TBody>
                        {data.today.map((appointment) => (
                          <Tr key={appointment.id}>
                            <Td num className="w-16">
                              {time(appointment.startsAt)}
                            </Td>
                            <Td>
                              <strong className="font-medium">{appointment.title}</strong>
                              {appointment.client && (
                                <div className="note mt-0.5">
                                  {appointment.client.firstName}{' '}
                                  {appointment.client.lastName ?? ''}
                                </div>
                              )}
                            </Td>
                            <Td className="w-[90px]">
                              <Badge
                                tone={appointment.status === 'CONFIRMED' ? 'green' : 'neutral'}
                              >
                                {APPOINTMENT_TYPE_LABEL[appointment.type]}
                              </Badge>
                            </Td>
                          </Tr>
                        ))}
                      </TBody>
                  </Table>
                )}
              </Card>

              <Card title="Inventario por ciudad" flush>
                {data.byCity.length === 0 ? (
                  <div className="p-5">
                    <Empty title="Todavía no hay inmuebles">
                      Da de alta el primero o importa el inventario de WASI.
                    </Empty>
                  </div>
                ) : (
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
                )}
              </Card>
            </div>

            <Card
              title="Publicados sin ningún interesado"
              action={<span className="note">Anuncios que reciben visitas y no convierten</span>}
              flush
            >
              {data.attention.length === 0 ? (
                <div className="p-5">
                  <Empty title="Nada pendiente">
                    Todos los inmuebles publicados tienen al menos un cliente vinculado.
                  </Empty>
                </div>
              ) : (
                <Table>
                    <THead>
                      <tr>
                        <Th>Código</Th>
                        <Th>Inmueble</Th>
                        <Th hideSm>Ciudad</Th>
                        <Th num>Precio</Th>
                        <Th num>Visitas</Th>
                        <Th num>Portales</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {data.attention.map((row) => (
                        <Tr key={row.id}>
                          <Td className="tabular">{row.code}</Td>
                          <Td>
                            <Link to={`/inmuebles/${row.id}`} className="hover:underline">
                              {row.title}
                            </Link>
                          </Td>
                          <Td hideSm>{row.city}</Td>
                          <Td num>{money(row.sale_price)}</Td>
                          <Td num>{number(row.visits)}</Td>
                          <Td num>
                            {row.portals === 0 ? (
                              <Badge tone="amber">sin publicar</Badge>
                            ) : (
                              number(row.portals)
                            )}
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
