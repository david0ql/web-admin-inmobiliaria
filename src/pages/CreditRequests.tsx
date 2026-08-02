import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  api,
  type CoApplicant,
  type CreditRequest,
  type CreditRequestStatus,
  type Page,
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
import { date, money, number, relative } from '../lib/format';

const STATUS_LABEL: Record<CreditRequestStatus, string> = {
  NEW: 'Nueva',
  REVIEWING: 'En estudio',
  SUBMITTED: 'Radicada',
  PREAPPROVED: 'Preaprobada',
  REJECTED: 'Negada',
  DROPPED: 'Desistida',
};

const STATUS_TONE: Record<
  CreditRequestStatus,
  'green' | 'amber' | 'red' | 'blue' | 'neutral'
> = {
  NEW: 'amber',
  REVIEWING: 'blue',
  SUBMITTED: 'blue',
  PREAPPROVED: 'green',
  REJECTED: 'red',
  DROPPED: 'neutral',
};

const DOCUMENT_LABEL: Record<string, string> = {
  CC: 'C.C.',
  CE: 'C.E.',
  PASSPORT: 'Pasaporte',
  NIT: 'NIT',
};

const OCCUPATION_LABEL: Record<string, string> = {
  SALARIED: 'Asalariado',
  PENSIONER: 'Pensionado',
  SELF_EMPLOYED: 'Independiente',
};

const GENDER_LABEL: Record<string, string> = {
  FEMALE: 'Femenino',
  MALE: 'Masculino',
  OTHER: 'Otro',
  UNDISCLOSED: 'Prefiere no decirlo',
};

const PORTFOLIO_LABEL: Record<string, string> = {
  VIS: 'VIS',
  NON_VIS: 'No VIS',
};

const HOUSING_LABEL: Record<string, string> = {
  NEW: 'Vivienda nueva',
  USED: 'Vivienda usada',
};

const PRODUCT_LABEL: Record<string, string> = {
  MORTGAGE: 'Crédito hipotecario',
  HOUSING_LEASING: 'Leasing habitacional',
};

/**
 * Bandeja de consultas de viabilidad de credito.
 *
 * Llegan del modal de "Créditos" de la web publica. Son leads con datos
 * personales sin verificar: no entran en la cartera hasta que alguien los toma,
 * y tomarlos es justo lo que hace "Pasar al embudo".
 */
export function CreditRequests() {
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<CreditRequest | null>(null);
  const debounced = useDebounced(q);

  const counts = useFetch<Record<string, number>>(
    (signal) => api.get<Record<string, number>>('/credit-requests/counts', undefined, signal),
    [open],
  );

  const { data, error, loading, reload } = useFetch<Page<CreditRequest>>(
    (signal) =>
      api.get<Page<CreditRequest>>(
        '/credit-requests',
        { status: status || undefined, q: debounced || undefined, page, limit: 25 },
        signal,
      ),
    [status, debounced, page],
  );

  const pending = counts.data?.NEW ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Captación"
        title="Consultas de crédito"
        actions={
          pending > 0 && <Badge tone="amber">{number(pending)} sin revisar</Badge>
        }
      />

      <div className="content stack">
        <div className="filters">
          <label className="field" style={{ flex: '1 1 260px' }}>
            <span>Buscar</span>
            <input
              className="input"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Nombre, correo, teléfono, documento o referencia"
            />
          </label>
          <label className="field" style={{ flex: '0 1 200px' }}>
            <span>Estado</span>
            <select
              className="select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                  {counts.data?.[value] ? ` (${counts.data[value]})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && (
          <Card flush>
            {data.data.length === 0 ? (
              <Empty title="No hay consultas de crédito">
                Aquí llegan las consultas de viabilidad que la gente envía desde la web. Al pasarlas
                al embudo, el interesado queda dado de alta como cliente con el caso ya escrito en
                su requerimiento.
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Referencia</th>
                        <th>Solicitante</th>
                        <th className="hide-sm">Producto</th>
                        <th className="num">Monto</th>
                        <th className="num hide-sm">Plazo</th>
                        <th>Estado</th>
                        <th className="num">Recibida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((request) => (
                        <tr key={request.id} className="clickable" onClick={() => setOpen(request)}>
                          <td className="figure">{request.reference}</td>
                          <td>
                            <strong>
                              {request.firstName} {request.lastName}
                            </strong>
                            <div className="note" style={{ marginTop: 2 }}>
                              {request.phone}
                              {request.coApplicant ? ' · con segundo solicitante' : ''}
                            </div>
                          </td>
                          <td className="hide-sm">
                            {PRODUCT_LABEL[request.product] ?? request.product}
                            <div className="note" style={{ marginTop: 2 }}>
                              {PORTFOLIO_LABEL[request.portfolioType]} ·{' '}
                              {HOUSING_LABEL[request.housingType]}
                            </div>
                          </td>
                          <td className="num">{money(request.amount)}</td>
                          <td className="num hide-sm">{request.termYears} años</td>
                          <td>
                            <Badge tone={STATUS_TONE[request.status]}>
                              {STATUS_LABEL[request.status]}
                            </Badge>
                          </td>
                          <td className="num small muted">{relative(request.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={data.meta.page}
                  pages={data.meta.pages}
                  total={data.meta.total}
                  unit="consultas"
                  onPage={setPage}
                />
              </>
            )}
          </Card>
        )}
      </div>

      {open && (
        <CreditDetail
          request={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            reload();
            counts.reload();
          }}
        />
      )}
    </>
  );
}

function CreditDetail({
  request,
  onClose,
  onDone,
}: {
  request: CreditRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState<CreditRequestStatus>(request.status);
  const [institution, setInstitution] = useState(request.institution ?? '');
  const [resolution, setResolution] = useState(request.resolution ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editable = can('ADMIN', 'MANAGER', 'AGENT');

  async function review() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/credit-requests/${request.id}/review`, {
        status,
        institution: institution.trim() || undefined,
        resolution: resolution.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la consulta.');
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ clientId: string }>(
        `/credit-requests/${request.id}/convert`,
      );
      navigate(`/clientes/${result.clientId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo pasar al embudo.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${request.reference} · ${request.firstName} ${request.lastName}`}
      onClose={onClose}
      wide
      footer={
        editable && (
          <>
            <Button onClick={onClose}>Cerrar</Button>
            {request.clientId ? (
              <Button
                variant="primary"
                onClick={() => navigate(`/clientes/${request.clientId}`)}
              >
                Ver el cliente
              </Button>
            ) : (
              <>
                <Button loading={busy} onClick={() => void review()}>
                  Guardar estado
                </Button>
                <Button variant="primary" loading={busy} onClick={() => void convert()}>
                  Pasar al embudo
                </Button>
              </>
            )}
          </>
        )
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}

        <div className="row row-wrap" style={{ gap: 6 }}>
          <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          <Badge>{PRODUCT_LABEL[request.product] ?? request.product}</Badge>
          <Badge>{PORTFOLIO_LABEL[request.portfolioType]}</Badge>
          <Badge>{HOUSING_LABEL[request.housingType]}</Badge>
          {request.coApplicant && <Badge tone="blue">Dos solicitantes</Badge>}
          {request.hasPropertyPicked && <Badge tone="blue">Ya eligió inmueble</Badge>}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        >
          <Card title="El crédito" flush>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <Row label="Monto solicitado" value={money(request.amount)} />
                  <Row label="Plazo" value={`${request.termYears} años`} />
                  <Row
                    label="Ingreso mensual"
                    value={request.monthlyIncome ? money(request.monthlyIncome) : '—'}
                  />
                  <Row label="Ciudad donde trabaja" value={request.workCityName} />
                  <Row
                    label="Valor del inmueble"
                    value={request.propertyValue ? money(request.propertyValue) : '—'}
                  />
                  <Row label="Inmueble" value={request.propertyCode ?? 'Sin elegir'} />
                  <Row label="Entidad" value={request.institution ?? '—'} />
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Solicitante" flush>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <Person person={request} />
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {request.coApplicant && (
          <Card title="Segundo solicitante" flush>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <Person person={request.coApplicant} />
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {request.notes && (
          <Card title="Observaciones del solicitante">
            <p style={{ fontSize: 'var(--t-small)', whiteSpace: 'pre-wrap' }}>{request.notes}</p>
          </Card>
        )}

        <p className="note">
          Autorizó el tratamiento de datos el {date(request.acceptedTermsAt)}.
        </p>

        {editable && !request.clientId && (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <SelectField
              label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as CreditRequestStatus)}
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Field
              label="Entidad"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Banco al que se radicó"
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <TextareaField
                label="Notas de la gestión"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Qué se le dijo, qué falta, por qué se negó. Lo ve el equipo, no el solicitante."
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Las mismas filas para el titular y para el segundo solicitante. */
function Person({
  person,
}: {
  person: CreditRequest | CoApplicant;
}) {
  return (
    <>
      <Row label="Nombre" value={`${person.firstName} ${person.lastName}`} />
      <Row
        label="Documento"
        value={`${DOCUMENT_LABEL[person.documentType] ?? person.documentType} ${person.documentNumber}`}
      />
      <Row label="Nacimiento" value={`${date(person.birthDate)} · ${age(person.birthDate)} años`} />
      <Row label="Teléfono" value={person.phone} />
      <Row label="Correo" value={person.email} />
      <Row label="Género" value={person.gender ? GENDER_LABEL[person.gender] : '—'} />
      <Row
        label="Ocupación"
        value={OCCUPATION_LABEL[person.occupation] ?? person.occupation}
      />
      <Row
        label="Ingreso mensual"
        value={person.monthlyIncome ? money(person.monthlyIncome) : '—'}
      />
    </>
  );
}

/** La edad al vencimiento es lo que decide la viabilidad, así que se calcula. */
function age(birthDate: string): number {
  const born = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) years -= 1;
  return years;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="note" style={{ width: '48%' }}>
        {label}
      </td>
      <td>{value}</td>
    </tr>
  );
}
