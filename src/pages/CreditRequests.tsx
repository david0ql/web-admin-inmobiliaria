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
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  Pager,
  SelectField,
  Table,
  TBody,
  Td,
  TextareaField,
  Th,
  THead,
  Tr,
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

      <PageBody>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field
            label="Buscar"
            className="col-span-2"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Nombre, correo, teléfono, documento o referencia"
          />
          <SelectField
            label="Estado"
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
          </SelectField>
        </div>

        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && data.data.length === 0 && (
          <Empty title="No hay consultas de crédito">
            Aquí llegan las consultas de viabilidad que la gente envía desde la web. Al pasarlas
            al embudo, el interesado queda dado de alta como cliente con el caso ya escrito en
            su requerimiento.
          </Empty>
        )}

        {data && data.data.length > 0 && (
          <Card flush>
            <Table>
              <THead>
                <tr>
                  <Th>Referencia</Th>
                  <Th>Solicitante</Th>
                  <Th hideSm>Producto</Th>
                  <Th num>Monto</Th>
                  <Th num hideSm>
                    Plazo
                  </Th>
                  <Th>Estado</Th>
                  <Th num>Recibida</Th>
                </tr>
              </THead>
              <TBody>
                {data.data.map((request) => (
                  <Tr key={request.id} onClick={() => setOpen(request)}>
                    <Td className="tabular">{request.reference}</Td>
                    <Td>
                      <strong className="font-medium">
                        {request.firstName} {request.lastName}
                      </strong>
                      <div className="note mt-0.5">
                        {request.phone}
                        {request.coApplicant ? ' · con segundo solicitante' : ''}
                      </div>
                    </Td>
                    <Td hideSm>
                      {PRODUCT_LABEL[request.product] ?? request.product}
                      <div className="note mt-0.5">
                        {PORTFOLIO_LABEL[request.portfolioType]} ·{' '}
                        {HOUSING_LABEL[request.housingType]}
                      </div>
                    </Td>
                    <Td num>{money(request.amount)}</Td>
                    <Td num hideSm>
                      {request.termYears} años
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[request.status]}>
                        {STATUS_LABEL[request.status]}
                      </Badge>
                    </Td>
                    <Td num className="text-muted-foreground">
                      {relative(request.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pager
              page={data.meta.page}
              pages={data.meta.pages}
              total={data.meta.total}
              unit="consultas"
              onPage={setPage}
            />
          </Card>
        )}
      </PageBody>

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
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            {request.clientId ? (
              <Button onClick={() => navigate(`/clientes/${request.clientId}`)}>
                Ver el cliente
              </Button>
            ) : (
              <>
                <Button variant="outline" loading={busy} onClick={() => void review()}>
                  Guardar estado
                </Button>
                <Button loading={busy} onClick={() => void convert()}>
                  Pasar al embudo
                </Button>
              </>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          <Badge>{PRODUCT_LABEL[request.product] ?? request.product}</Badge>
          <Badge>{PORTFOLIO_LABEL[request.portfolioType]}</Badge>
          <Badge>{HOUSING_LABEL[request.housingType]}</Badge>
          {request.coApplicant && <Badge tone="blue">Dos solicitantes</Badge>}
          {request.hasPropertyPicked && <Badge tone="blue">Ya eligió inmueble</Badge>}
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          <Card title="El crédito">
            <dl className="grid">
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
            </dl>
          </Card>

          <Card title="Solicitante">
            <dl className="grid">
              <Person person={request} />
            </dl>
          </Card>
        </div>

        {request.coApplicant && (
          <Card title="Segundo solicitante">
            <dl className="grid">
              <Person person={request.coApplicant} />
            </dl>
          </Card>
        )}

        {request.notes && (
          <Card title="Observaciones del solicitante">
            <p className="text-sm whitespace-pre-wrap">{request.notes}</p>
          </Card>
        )}

        <p className="note">
          Autorizó el tratamiento de datos el {date(request.acceptedTermsAt)}.
        </p>

        {editable && !request.clientId && (
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="sm:col-span-2">
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

/** Una fila de ficha: rotulo a la izquierda, dato a la derecha. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </div>
  );
}
