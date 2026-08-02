import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  api,
  download,
  type ConsignmentDocumentType,
  type ConsignmentRequest,
  type ConsignmentStatus,
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

/** Los cinco documentos que la agencia pide, en el orden del formulario. */
const DOCUMENTS: { type: ConsignmentDocumentType; label: string }[] = [
  { type: 'TRADITION', label: 'Certificado de tradición y libertad' },
  { type: 'DEED', label: 'Última escritura pública de adquisición' },
  { type: 'OWNER_ID', label: 'Cédula del o los propietarios' },
  { type: 'PROPERTY_TAX', label: 'Último recibo de impuesto predial' },
  { type: 'MAINTENANCE_BILL', label: 'Último recibo de administración' },
];

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
            placeholder="Propietario, dirección, conjunto o referencia"
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
          <Empty title="No hay solicitudes">
            Aquí llegan los inmuebles que los propietarios proponen desde la web. Al aceptar
            una, se convierte en inmueble del inventario con sus fotos, y el propietario queda
            dado de alta como cliente.
          </Empty>
        )}

        {data && data.data.length > 0 && (
          <Card flush>
            <Table>
              <THead>
                <tr>
                  <Th>Referencia</Th>
                  <Th>Inmueble</Th>
                  <Th hideSm>Propietario</Th>
                  <Th num>Precio</Th>
                  <Th num hideSm>
                    Área
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
                      <strong className="font-medium">{request.complexName}</strong>
                      <div className="note mt-0.5">
                        {request.propertyTypeName} · {request.neighborhood}, {request.cityName}
                      </div>
                    </Td>
                    <Td hideSm>
                      {request.ownerFirstName} {request.ownerLastName}
                      <div className="note mt-0.5">{request.ownerPhone}</div>
                    </Td>
                    <Td num>{money(request.salePrice)}</Td>
                    <Td num hideSm>
                      {area(Number(request.builtArea))}
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
              unit="solicitudes"
              onPage={setPage}
            />
          </Card>
        )}
      </PageBody>

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
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            {request.propertyId ? (
              <Button onClick={() => navigate(`/inmuebles/${request.propertyId}`)}>
                Ver el inmueble
              </Button>
            ) : (
              <>
                <Button variant="outline" loading={busy} onClick={() => void review()}>
                  Guardar estado
                </Button>
                <Button
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
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        {!request.propertyId && !convertible && (
          <Alert tone="warn">
            El propietario escribió la ciudad y el tipo a mano y no coinciden con el catálogo. Hay
            que resolverlos antes de poder convertir la solicitud en inmueble.
          </Alert>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          <Badge>{request.propertyTypeName}</Badge>
          <Badge>{CONDITION_LABEL[request.condition] ?? request.condition}</Badge>
          <Badge>{OCCUPANCY_LABEL[request.occupancy] ?? request.occupancy}</Badge>
          {request.hasElevator && <Badge tone="blue">con ascensor</Badge>}
          {request.hasStorageRoom && <Badge tone="blue">con depósito</Badge>}
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          <Card title="Inmueble">
            <dl className="grid">
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
            </dl>
          </Card>

          <Card title="Dinero y propietario">
            <dl className="grid">
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
            </dl>
          </Card>
        </div>

        {request.notes && (
          <Card title="Observaciones del propietario">
            <p className="text-sm whitespace-pre-wrap">{request.notes}</p>
          </Card>
        )}

        {photos.length > 0 && (
          <Card title={`Fotos · ${photos.length}`}>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
              {photos.map((photo) => (
                <figure
                  key={photo.storageKey}
                  className="relative m-0 aspect-[4/3] overflow-hidden rounded-md border"
                >
                  <img
                    src={photo.url}
                    alt={photo.originalName}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </figure>
              ))}
            </div>
          </Card>
        )}

        {/* Los cinco documentos son una lista de comprobación, no un adjunto
            suelto: interesa tanto lo que llegó como lo que falta. */}
        <Card title={`Documentos · ${documents.length} de ${DOCUMENTS.length}`} flush>
          <Table>
              <TBody>
                {DOCUMENTS.map(({ type, label }) => {
                  const file = documents.find((doc) => doc.docType === type);
                  // La posición es la que la API espera en la ruta: se pide por
                  // índice y no por clave, para que la URL no valga sola.
                  const index = file ? documents.indexOf(file) : -1;
                  return (
                    <Tr key={type}>
                      <Td>
                        {label}
                        {file && (
                          <div className="note mt-0.5">
                            {file.originalName} · {Math.round(file.bytes / 1024)} KB
                          </div>
                        )}
                      </Td>
                      <Td className="w-[130px]">
                        {file ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void download(
                                `/consignments/${request.id}/documents/${index}`,
                                file.originalName,
                              )
                            }
                          >
                            Descargar
                          </Button>
                        ) : (
                          <Badge tone="amber">Falta</Badge>
                        )}
                      </Td>
                    </Tr>
                  );
                })}

                {/* Los que llegaron de envíos antiguos, sin categoría. */}
                {documents
                  .filter((doc) => !doc.docType)
                  .map((document) => (
                    <Tr key={document.storageKey}>
                      <Td>
                        Sin clasificar
                        <div className="note mt-0.5">
                          {document.originalName} · {Math.round(document.bytes / 1024)} KB
                        </div>
                      </Td>
                      <Td className="w-[130px]">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void download(
                              `/consignments/${request.id}/documents/${documents.indexOf(document)}`,
                              document.originalName,
                            )
                          }
                        >
                          Descargar
                        </Button>
                      </Td>
                    </Tr>
                  ))}
              </TBody>
          </Table>
        </Card>

        {editable && !request.propertyId && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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

/** Una fila de ficha: rotulo a la izquierda, dato a la derecha. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </div>
  );
}
