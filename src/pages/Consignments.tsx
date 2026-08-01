import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  api,
  type ConsignmentRequest,
  type ConsignmentStatus,
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
  Loading,
  Modal,
  Pager,
  SelectField,
  TextareaField,
} from '../components/ui';
import { area, date, money, number, relative } from '../lib/format';

const STATUS_LABEL: Record<ConsignmentStatus, string> = {
  NEW: 'Nueva',
  REVIEWING: 'En revisión',
  VISIT_SCHEDULED: 'Visita agendada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
};

const STATUS_TONE: Record<ConsignmentStatus, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  NEW: 'amber',
  REVIEWING: 'blue',
  VISIT_SCHEDULED: 'blue',
  ACCEPTED: 'green',
  REJECTED: 'red',
};

const CONDITION_LABEL: Record<string, string> = {
  ORIGINAL: 'Original',
  TO_REMODEL: 'Para remodelar',
  REMODELED: 'Remodelado',
  BRAND_NEW: 'A estrenar',
  SHELL: 'Obra gris',
  BLUEPRINT: 'Sobre planos',
};

const CREDIT_LABEL: Record<string, string> = {
  MORTGAGE: 'Hipoteca',
  LEASING: 'Leasing',
  DEBT_FREE: 'Libre de deuda',
};

const OCCUPANCY_LABEL: Record<string, string> = {
  RENTED: 'Arrendado',
  VACANT: 'Desocupado',
  OWNER_OCCUPIED: 'Habitado por el propietario',
};

const VIEW_LABEL: Record<string, string> = {
  NORTH: 'Norte',
  SOUTH: 'Sur',
  EAST: 'Oriente',
  WEST: 'Occidente',
};

export function Consignments() {
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ConsignmentRequest | null>(null);
  const debounced = useDebounced(q);

  const counts = useFetch<Record<string, number>>(
    (signal) => api.get<Record<string, number>>('/consignments/counts', undefined, signal),
    [open],
  );

  const { data, error, loading, reload } = useFetch<Page<ConsignmentRequest>>(
    (signal) =>
      api.get<Page<ConsignmentRequest>>(
        '/consignments',
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
        title="Solicitudes de consignación"
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
              placeholder="Propietario, dirección, conjunto o referencia"
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
              <Empty title="No hay solicitudes">
                Aquí llegan los inmuebles que los propietarios proponen desde la web. Al aceptar
                una, se convierte en inmueble del inventario con sus fotos, y el propietario queda
                dado de alta como cliente.
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Referencia</th>
                        <th>Inmueble</th>
                        <th className="hide-sm">Propietario</th>
                        <th className="num">Precio</th>
                        <th className="num hide-sm">Área</th>
                        <th>Estado</th>
                        <th className="num">Recibida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((request) => (
                        <tr key={request.id} className="clickable" onClick={() => setOpen(request)}>
                          <td className="figure">{request.reference}</td>
                          <td>
                            <strong>{request.complexName}</strong>
                            <div className="note" style={{ marginTop: 2 }}>
                              {request.propertyTypeName} · {request.neighborhood},{' '}
                              {request.cityName}
                            </div>
                          </td>
                          <td className="hide-sm">
                            {request.ownerFirstName} {request.ownerLastName}
                            <div className="note" style={{ marginTop: 2 }}>
                              {request.ownerPhone}
                            </div>
                          </td>
                          <td className="num">{money(request.salePrice)}</td>
                          <td className="num hide-sm">{area(Number(request.builtArea))}</td>
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
                  unit="solicitudes"
                  onPage={setPage}
                />
              </>
            )}
          </Card>
        )}
      </div>

      {open && (
        <ConsignmentDetail
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

function ConsignmentDetail({
  request,
  onClose,
  onDone,
}: {
  request: ConsignmentRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState<ConsignmentStatus>(request.status);
  const [resolution, setResolution] = useState(request.resolution ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editable = can('ADMIN', 'MANAGER', 'AGENT');
  const photos = request.files.filter((file) => file.kind === 'PHOTO');
  const documents = request.files.filter((file) => file.kind === 'DOCUMENT');
  const convertible = !request.propertyId && request.cityId && request.propertyTypeId;

  async function review() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/consignments/${request.id}/review`, {
        status,
        resolution: resolution.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ propertyId: string }>(
        `/consignments/${request.id}/accept`,
      );
      navigate(`/inmuebles/${result.propertyId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo convertir la solicitud.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${request.reference} · ${request.complexName}`}
      onClose={onClose}
      wide
      footer={
        editable && (
          <>
            <Button onClick={onClose}>Cerrar</Button>
            {request.propertyId ? (
              <Button
                variant="primary"
                onClick={() => navigate(`/inmuebles/${request.propertyId}`)}
              >
                Ver el inmueble
              </Button>
            ) : (
              <>
                <Button loading={busy} onClick={() => void review()}>
                  Guardar estado
                </Button>
                <Button
                  variant="primary"
                  loading={busy}
                  disabled={!convertible}
                  onClick={() => void accept()}
                >
                  Convertir en inmueble
                </Button>
              </>
            )}
          </>
        )
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}

        {!request.propertyId && !convertible && (
          <div className="alert alert-warn">
            El propietario escribió la ciudad y el tipo a mano y no coinciden con el catálogo. Hay
            que resolverlos antes de poder convertir la solicitud en inmueble.
          </div>
        )}

        <div className="row row-wrap" style={{ gap: 6 }}>
          <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          <Badge>{request.propertyTypeName}</Badge>
          <Badge>{CONDITION_LABEL[request.condition] ?? request.condition}</Badge>
          <Badge>{OCCUPANCY_LABEL[request.occupancy] ?? request.occupancy}</Badge>
          {request.hasElevator && <Badge tone="blue">con ascensor</Badge>}
          {request.hasStorageRoom && <Badge tone="blue">con depósito</Badge>}
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <Card title="Inmueble" flush>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <Row label="Conjunto" value={request.complexName} />
                  <Row label="Dirección" value={`${request.address} — ${request.unitNumber}`} />
                  <Row
                    label="Ubicación"
                    value={[request.neighborhood, request.commune, request.cityName]
                      .filter(Boolean)
                      .join(', ')}
                  />
                  <Row label="Estrato" value={String(request.stratum)} />
                  <Row label="Piso" value={request.floor ?? '—'} />
                  <Row label="Vista" value={request.view ? VIEW_LABEL[request.view] : '—'} />
                  <Row label="Área construida" value={area(Number(request.builtArea))} />
                  <Row
                    label="Área privada"
                    value={request.privateArea ? area(Number(request.privateArea)) : '—'}
                  />
                  <Row
                    label="Área del lote"
                    value={request.lotArea ? area(Number(request.lotArea)) : '—'}
                  />
                  <Row label="Alcobas" value={String(request.bedrooms)} />
                  <Row label="Baños" value={String(request.bathrooms)} />
                  <Row label="Parqueaderos" value={String(request.parkingSpaces)} />
                  <Row label="Año" value={String(request.buildingYear)} />
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Dinero y propietario" flush>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <Row label="Precio de venta" value={money(request.salePrice)} />
                  <Row label="Administración" value={money(request.maintenanceFee)} />
                  <Row
                    label="Crédito"
                    value={CREDIT_LABEL[request.creditType] ?? request.creditType}
                  />
                  <Row label="Entidad" value={request.creditInstitution ?? '—'} />
                  <Row
                    label="Deuda"
                    value={request.debtAmount ? money(request.debtAmount) : '—'}
                  />
                  <Row
                    label="Arriendo"
                    value={request.rentAmount ? money(request.rentAmount) : '—'}
                  />
                  <Row
                    label="Fin de contrato"
                    value={request.leaseEndsOn ? date(request.leaseEndsOn) : '—'}
                  />
                  <Row
                    label="Propietario"
                    value={`${request.ownerFirstName} ${request.ownerLastName}`}
                  />
                  <Row label="Teléfono" value={request.ownerPhone} />
                  <Row label="Correo" value={request.ownerEmail} />
                  <Row
                    label="Visita pedida"
                    value={request.requestedVisitAt ? date(request.requestedVisitAt) : '—'}
                  />
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {request.notes && (
          <Card title="Observaciones del propietario">
            <p style={{ fontSize: 'var(--t-small)', whiteSpace: 'pre-wrap' }}>{request.notes}</p>
          </Card>
        )}

        {photos.length > 0 && (
          <Card title={`Fotos · ${photos.length}`}>
            <div className="gallery">
              {photos.map((photo) => (
                <figure key={photo.storageKey}>
                  <img src={photo.url} alt={photo.originalName} loading="lazy" />
                </figure>
              ))}
            </div>
          </Card>
        )}

        <Card title={`Documentos · ${documents.length}`} flush>
          {documents.length === 0 ? (
            <p className="note" style={{ padding: 16 }}>
              El propietario no adjuntó documentos, o los que envió no pasaron la revisión de
              seguridad.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.storageKey}>
                      <td>{document.originalName}</td>
                      <td className="num">{Math.round(document.bytes / 1024)} KB</td>
                      <td style={{ width: 110 }}>
                        <a
                          className="btn btn-sm"
                          href={document.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Descargar
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {editable && !request.propertyId && (
          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <SelectField
              label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as ConsignmentStatus)}
            >
              {Object.entries(STATUS_LABEL)
                .filter(([value]) => value !== 'ACCEPTED')
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </SelectField>
            <TextareaField
              label="Notas de la revisión"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Por qué se acepta o se rechaza. Lo verá el equipo, no el propietario."
            />
          </div>
        )}
      </div>
    </Modal>
  );
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
