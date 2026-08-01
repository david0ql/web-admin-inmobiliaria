import { Link } from 'react-router-dom';
import { api, type Appointment, type AttentionRow, type CityInventory, type Overview } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import { Badge, Card, Empty, ErrorNote, Loading, Stat } from '../components/ui';
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

      <div className="content stack">
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && <Loading rows={4} />}

        {data && (
          <>
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
            >
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

            <div
              className="grid"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)' }}
            >
              <Card
                title="Agenda de hoy"
                action={
                  <Link to="/agenda" className="btn btn-sm btn-ghost">
                    Ver calendario
                  </Link>
                }
                flush
              >
                {data.today.length === 0 ? (
                  <Empty title="Sin citas hoy">
                    Cuando agendes una visita aparecerá aquí, con su hora y el inmueble.
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <tbody>
                        {data.today.map((appointment) => (
                          <tr key={appointment.id}>
                            <td className="num" style={{ width: 64 }}>
                              {time(appointment.startsAt)}
                            </td>
                            <td>
                              <strong>{appointment.title}</strong>
                              {appointment.client && (
                                <div className="note" style={{ marginTop: 2 }}>
                                  {appointment.client.firstName}{' '}
                                  {appointment.client.lastName ?? ''}
                                </div>
                              )}
                            </td>
                            <td style={{ width: 90 }}>
                              <Badge tone={appointment.status === 'CONFIRMED' ? 'green' : 'neutral'}>
                                {APPOINTMENT_TYPE_LABEL[appointment.type]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="Inventario por ciudad" flush>
                {data.byCity.length === 0 ? (
                  <Empty title="Todavía no hay inmuebles">
                    Da de alta el primero o importa el inventario de WASI.
                  </Empty>
                ) : (
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
                )}
              </Card>
            </div>

            <Card
              title="Publicados sin ningún interesado"
              action={<span className="note">Anuncios que reciben visitas y no convierten</span>}
              flush
            >
              {data.attention.length === 0 ? (
                <Empty title="Nada pendiente">
                  Todos los inmuebles publicados tienen al menos un cliente vinculado.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Inmueble</th>
                        <th className="hide-sm">Ciudad</th>
                        <th className="num">Precio</th>
                        <th className="num">Visitas</th>
                        <th className="num">Portales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.attention.map((row) => (
                        <tr key={row.id}>
                          <td className="figure">{row.code}</td>
                          <td>
                            <Link to={`/inmuebles/${row.id}`}>{row.title}</Link>
                          </td>
                          <td className="hide-sm">{row.city}</td>
                          <td className="num">{money(row.sale_price)}</td>
                          <td className="num">{number(row.visits)}</td>
                          <td className="num">
                            {row.portals === 0 ? (
                              <Badge tone="amber">sin publicar</Badge>
                            ) : (
                              number(row.portals)
                            )}
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
