import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  api,
  type Agent,
  type Catalogs,
  type Property,
  type PropertyInterest,
  type Publication,
} from '../lib/api';
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
  Modal,
  SelectField,
} from '../components/ui';
import {
  AVAILABILITY_LABEL,
  CONDITION_LABEL,
  INTEREST_ROLE_LABEL,
  INTEREST_STATUS_LABEL,
  PUBLICATION_LABEL,
  area,
  date,
  money,
  number,
} from '../lib/format';
import { AVAILABILITY_TONE } from './Properties';

interface Detail {
  property: Property;
  interests: PropertyInterest[];
  publications: Publication[];
}

export function PropertyDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [assigning, setAssigning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, error, loading, reload } = useFetch<Detail>(
    async (signal) => {
      const [property, interests, publications] = await Promise.all([
        api.get<Property>(`/properties/${id}`, undefined, signal),
        api.get<PropertyInterest[]>(`/properties/${id}/interests`, undefined, signal),
        api.get<Publication[]>(`/properties/${id}/publications`, undefined, signal),
      ]);
      return { property, interests, publications };
    },
    [id],
  );

  if (loading) return <Loading rows={8} />;
  if (error || !data) {
    return (
      <div className="content">
        <ErrorNote onRetry={reload}>{error ?? 'Inmueble no encontrado'}</ErrorNote>
      </div>
    );
  }

  const { property, interests, publications } = data;

  /**
   * Sube fotos al servidor propio. Van en `multipart/form-data` porque el
   * backend las recomprime: no se guardan enlaces a un CDN ajeno.
   */
  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      for (const file of Array.from(files)) body.append('files', file);

      const res = await fetch(`/api/v1/properties/${id}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('serrano.access') ?? ''}` },
        body,
      });
      const payload = (await res.json()) as {
        message?: string | string[];
        rejected?: { name: string; reason: string }[];
      };
      if (!res.ok) {
        throw new ApiError(
          res.status,
          Array.isArray(payload.message)
            ? payload.message.join('. ')
            : (payload.message ?? 'No se pudieron subir las fotos'),
        );
      }
      if (payload.rejected?.length) {
        setUploadError(
          `No se pudieron procesar: ${payload.rejected.map((r) => `${r.name} (${r.reason})`).join('; ')}`,
        );
      }
      reload();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'No se pudieron subir las fotos.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  const cover = property.images?.find((image) => image.isMain) ?? property.images?.[0];
  const editable = can('ADMIN', 'MANAGER', 'AGENT');

  return (
    <>
      <PageHeader
        eyebrow={`Inmueble ${property.code}`}
        title={property.title}
        actions={
          <>
            <Button onClick={() => navigate('/inmuebles')}>Volver</Button>
            {property.publicUrl && (
              <a
                className="btn"
                href={property.publicUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Ver ficha pública
              </a>
            )}
            {can('ADMIN', 'MANAGER') && (
              <Button onClick={() => setAssigning(true)}>Reasignar</Button>
            )}
            {editable && (
              <Button variant="primary" onClick={() => navigate(`/inmuebles/${id}/editar`)}>
                Editar
              </Button>
            )}
          </>
        }
      />

      <div className="content stack">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)' }}>
          <div className="stack">
            <Card flush>
              <div style={{ aspectRatio: '16 / 10', background: 'var(--surface-2)' }}>
                {cover ? (
                  <img
                    src={cover.urlLarge ?? cover.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div className="empty">
                    <h3>Sin fotografías</h3>
                    <p>Un inmueble sin fotos no se publica en ningún portal.</p>
                  </div>
                )}
              </div>
            </Card>

            {editable && (
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void uploadPhotos(e.target.files)}
              />
            )}

            <Card
              title={`Galería · ${property.images?.length ?? 0} fotos`}
              action={
                editable && (
                  <Button
                    size="sm"
                    loading={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    Subir fotos
                  </Button>
                )
              }
            >
              <div className="stack">
                {uploadError && <div className="alert alert-warn">{uploadError}</div>}
                {(property.images?.length ?? 0) === 0 ? (
                  <p className="note">
                    Aún no hay fotos. Se guardan en el servidor y se sirven desde aquí.
                  </p>
                ) : (
                <div className="gallery">
                  {property.images.map((image) => (
                    <figure key={image.id}>
                      <img src={image.url} alt={image.description ?? ''} loading="lazy" />
                      {image.isMain && (
                        <figcaption>
                          <Badge tone="ink">Portada</Badge>
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
                )}
              </div>
            </Card>

            {property.observations && (
              <Card title="Descripción">
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--t-small)' }}>
                  {property.observations}
                </p>
              </Card>
            )}

            {property.features && property.features.length > 0 && (
              <Card title={`Características · ${property.features.length}`}>
                <div className="row row-wrap" style={{ gap: 6 }}>
                  {property.features.map((feature) => (
                    <Badge key={feature.id} tone={feature.scope === 'INTERNAL' ? 'neutral' : 'blue'}>
                      {feature.name}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="stack">
            <Card>
              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <span className="note">Precio de venta</span>
                  <div
                    className="figure"
                    style={{ fontSize: '1.75rem', letterSpacing: '-0.03em', marginTop: 2 }}
                  >
                    {money(property.salePrice)}
                  </div>
                  {property.maintenanceFee ? (
                    <span className="note">
                      Administración {money(property.maintenanceFee)}
                    </span>
                  ) : null}
                </div>

                <div className="row row-wrap" style={{ gap: 6 }}>
                  <Badge tone={AVAILABILITY_TONE[property.availability]}>
                    {AVAILABILITY_LABEL[property.availability]}
                  </Badge>
                  <Badge tone={property.publicationStatus === 'OUTSTANDING' ? 'amber' : 'neutral'}>
                    {PUBLICATION_LABEL[property.publicationStatus]}
                  </Badge>
                  {/* La etiqueta heredada de WASI suele llamarse igual que el
                      estado ("Disponible"): solo se muestra si aporta algo. */}
                  {property.label &&
                    property.label.name.toLowerCase() !==
                      AVAILABILITY_LABEL[property.availability].toLowerCase() && (
                      <Badge color={property.label.color}>{property.label.name}</Badge>
                    )}
                </div>

                <div className="prop-specs" style={{ paddingTop: 12 }}>
                  <span className="prop-spec">
                    <b>{property.area ? number(property.area) : '—'}</b>
                    <span>m² totales</span>
                  </span>
                  <span className="prop-spec">
                    <b>{property.bedrooms ?? '—'}</b>
                    <span>alcobas</span>
                  </span>
                  <span className="prop-spec">
                    <b>{property.bathrooms ?? '—'}</b>
                    <span>baños</span>
                  </span>
                  <span className="prop-spec">
                    <b>{property.garages ?? '—'}</b>
                    <span>garajes</span>
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Ficha técnica" flush>
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    <Row label="Tipo" value={property.propertyType.name} />
                    <Row
                      label="Ubicación"
                      value={[property.zone?.name, property.city.name].filter(Boolean).join(', ')}
                    />
                    <Row label="Dirección" value={property.address ?? '—'} />
                    <Row label="Estrato" value={property.stratum ?? '—'} />
                    <Row label="Piso" value={property.floor ?? '—'} />
                    <Row label="Área construida" value={area(property.builtArea)} />
                    <Row label="Área privada" value={area(property.privateArea)} />
                    <Row
                      label="Estado"
                      value={property.condition ? CONDITION_LABEL[property.condition] : '—'}
                    />
                    <Row label="Año" value={property.buildingYear ?? '—'} />
                    <Row label="Visitas web" value={number(property.visits)} />
                    <Row label="Alta" value={date(property.createdAt)} />
                    <Row
                      label="Asesor"
                      value={
                        property.assignedAgent
                          ? `${property.assignedAgent.firstName} ${property.assignedAgent.lastName ?? ''}`
                          : 'Sin asignar'
                      }
                    />
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title={`Portales · ${publications.length}`}
              action={
                editable && (
                  <Button size="sm" onClick={() => setPublishing(true)}>
                    Gestionar
                  </Button>
                )
              }
              flush
            >
              {publications.length === 0 ? (
                <Empty title="Sin publicar">
                  Este inmueble no está en ningún portal, así que no lo está viendo nadie.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <tbody>
                      {publications.map((publication) => (
                        <tr key={publication.id}>
                          <td>{publication.portal.name}</td>
                          <td style={{ width: 110 }}>
                            <Badge
                              tone={
                                publication.state === 'PUBLISHED'
                                  ? 'green'
                                  : publication.state === 'REJECTED'
                                    ? 'red'
                                    : 'neutral'
                              }
                            >
                              {publication.state === 'PUBLISHED'
                                ? 'Publicado'
                                : publication.state === 'PENDING'
                                  ? 'Pendiente'
                                  : publication.state === 'REJECTED'
                                    ? 'Rechazado'
                                    : 'Pausado'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title={`Clientes vinculados · ${interests.length}`} flush>
              {interests.length === 0 ? (
                <Empty title="Nadie interesado todavía">
                  Vincula clientes desde su ficha para hacer seguimiento del inmueble.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <tbody>
                      {interests.map((interest) => (
                        <tr key={interest.id}>
                          <td>
                            {interest.client ? (
                              <Link to={`/clientes/${interest.clientId}`}>
                                {interest.client.firstName} {interest.client.lastName ?? ''}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ width: 110 }}>
                            <Badge>{INTEREST_ROLE_LABEL[interest.role]}</Badge>
                          </td>
                          <td style={{ width: 100 }} className="note">
                            {INTEREST_STATUS_LABEL[interest.status]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {assigning && (
        <AssignModal
          propertyId={id}
          currentAgentId={property.assignedAgentId}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            reload();
          }}
        />
      )}

      {publishing && (
        <PublishModal
          propertyId={id}
          current={publications.map((publication) => publication.portalId)}
          onClose={() => setPublishing(false)}
          onDone={() => {
            setPublishing(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td className="note" style={{ width: '45%' }}>
        {label}
      </td>
      <td>{value}</td>
    </tr>
  );
}

function AssignModal({
  propertyId,
  currentAgentId,
  onClose,
  onDone,
}: {
  propertyId: string;
  currentAgentId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const agents = useFetch<Agent[]>((signal) => api.get<Agent[]>('/agents', undefined, signal), []);
  const [agentId, setAgentId] = useState(currentAgentId ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/properties/${propertyId}/assign`, { agentId, reason: reason || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reasignar el inmueble.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reasignar inmueble"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!agentId || agentId === currentAgentId}
            onClick={() => void save()}
          >
            Reasignar
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}
        <SelectField
          label="Nuevo asesor"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {(agents.data ?? []).map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.firstName} {agent.lastName ?? ''}
            </option>
          ))}
        </SelectField>
        <label className="field">
          <span>Motivo</span>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Traslado de cartera, vacaciones…"
          />
          <span className="field-hint">
            Queda en el histórico del inmueble junto a quien lo captó.
          </span>
        </label>
      </div>
    </Modal>
  );
}

function PublishModal({
  propertyId,
  current,
  onClose,
  onDone,
}: {
  propertyId: string;
  current: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const catalogs = useFetch<Catalogs>(
    (signal) => api.get<Catalogs>('/catalogs/bootstrap', undefined, signal),
    [],
  );
  const [selected, setSelected] = useState<number[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/properties/${propertyId}/publications`, { portalIds: selected });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los portales.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Portales del inmueble"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Guardar {selected.length} portal{selected.length === 1 ? '' : 'es'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 8 }}>
        {error && <div className="alert">{error}</div>}
        {(catalogs.data?.portals ?? []).map((portal) => (
          <label key={portal.id} className="check">
            <input
              type="checkbox"
              checked={selected.includes(portal.id)}
              onChange={() => toggle(portal.id)}
            />
            <span>{portal.name}</span>
            {portal.paid && <Badge tone="amber">de pago</Badge>}
            {!portal.connected && <Badge tone="red">sin conectar</Badge>}
          </label>
        ))}
      </div>
    </Modal>
  );
}
