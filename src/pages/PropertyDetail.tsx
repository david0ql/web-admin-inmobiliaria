import { useRef, useState } from 'react';
import { Bath, BedDouble, Car, ExternalLink, Ruler } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  api,
  type Agent,
  type Catalogs,
  type Property,
  type PropertyFamily,
  type PropertyInterest,
  type Publication,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckField,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  SelectField,
  Table,
  TBody,
  Td,
  Tr,
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
  /** Otras unidades del mismo proyecto: mismo sitio, otra medida. */
  siblings: Property[];
}

export function PropertyDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [assigning, setAssigning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [linkingFamily, setLinkingFamily] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, error, loading, reload } = useFetch<Detail>(
    async (signal) => {
      const [property, interests, publications, siblings] = await Promise.all([
        api.get<Property>(`/properties/${id}`, undefined, signal),
        api.get<PropertyInterest[]>(`/properties/${id}/interests`, undefined, signal),
        api.get<Publication[]>(`/properties/${id}/publications`, undefined, signal),
        api.get<Property[]>(`/properties/${id}/siblings`, undefined, signal),
      ]);
      return { property, interests, publications, siblings };
    },
    [id],
  );

  if (loading) return <Loading rows={8} />;
  if (error || !data) {
    return (
      <PageBody>
        <ErrorNote onRetry={reload}>{error ?? 'Inmueble no encontrado'}</ErrorNote>
      </PageBody>
    );
  }

  const { property, interests, publications, siblings } = data;

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
            <Button variant="outline" onClick={() => navigate('/inmuebles')}>
              Volver
            </Button>
            {property.publicUrl && (
              <Button asChild variant="outline">
                <a href={property.publicUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Ver ficha pública
                </a>
              </Button>
            )}
            {/* Un asesor puede clasificar su propio inmueble; reasignarlo a
                otra persona es decision de coordinacion. */}
            {editable && (
              <Button variant="outline" onClick={() => setLinkingFamily(true)}>
                Proyecto
              </Button>
            )}
            {can('ADMIN', 'MANAGER') && (
              <Button variant="outline" onClick={() => setAssigning(true)}>
                Reasignar
              </Button>
            )}
            {editable && (
              <Button onClick={() => navigate(`/inmuebles/${id}/editar`)}>Editar</Button>
            )}
          </>
        }
      />

      <PageBody>
        {/* Hasta 992px las dos columnas se apilan. Antes eran fijas y a 400px
            la ficha tecnica quedaba en una columna de 130px. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Card flush className="overflow-hidden">
              <div className="aspect-[16/10] bg-secondary">
                {cover ? (
                  <img
                    src={cover.urlLarge ?? cover.url}
                    alt=""
                    className="block size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 text-center">
                    <p className="font-medium">Sin fotografías</p>
                    <p className="text-sm text-muted-foreground">
                      Un inmueble sin fotos no se publica en ningún portal.
                    </p>
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
                    variant="outline"
                    size="sm"
                    loading={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    Subir fotos
                  </Button>
                )
              }
            >
              <div className="flex flex-col gap-4">
                {uploadError && <Alert tone="warn">{uploadError}</Alert>}
                {(property.images?.length ?? 0) === 0 ? (
                  <p className="note">
                    Aún no hay fotos. Se guardan en el servidor y se sirven desde aquí.
                  </p>
                ) : (
                  <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
                    {property.images.map((image) => (
                      <figure
                        key={image.id}
                        className="relative m-0 aspect-[4/3] overflow-hidden rounded-md border"
                      >
                        <img
                          src={image.url}
                          alt={image.description ?? ''}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                        {image.isMain && (
                          <figcaption className="absolute top-1.5 left-1.5">
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
                <p className="text-sm whitespace-pre-wrap">{property.observations}</p>
              </Card>
            )}

            {property.observationsEn && (
              <Card title="Descripción en inglés">
                <p className="text-sm whitespace-pre-wrap">{property.observationsEn}</p>
              </Card>
            )}

            {property.features && property.features.length > 0 && (
              <Card title={`Características · ${property.features.length}`}>
                <div className="flex flex-wrap gap-1.5">
                  {property.features.map((feature) => (
                    <Badge key={feature.id} tone={feature.scope === 'INTERNAL' ? 'neutral' : 'blue'}>
                      {feature.name}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <div className="flex flex-col gap-3">
                <div>
                  <span className="note">Precio de venta</span>
                  <div className="tabular mt-0.5 text-3xl leading-none font-normal tracking-tight">
                    {money(property.salePrice)}
                  </div>
                  {property.maintenanceFee ? (
                    <span className="note">
                      Administración {money(property.maintenanceFee)}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
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

                <div className="-mx-5 -mb-5 mt-1 grid grid-cols-2 gap-x-4 gap-y-2 border-t bg-secondary/50 px-5 py-3 text-xs">
                  <Spec icon={Ruler} value={property.area ? area(property.area) : null} />
                  <Spec icon={BedDouble} value={property.bedrooms} unit="alcobas" />
                  <Spec icon={Bath} value={property.bathrooms} unit="baños" />
                  <Spec icon={Car} value={property.garages} unit="garajes" />
                </div>
              </div>
            </Card>

            <Card title="Ficha técnica">
              <dl className="grid">
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
                      label="Proyecto"
                      value={
                        property.family
                          ? `${property.family.name}${property.unitType ? ` · ${property.unitType}` : ''}`
                          : 'Suelto'
                      }
                    />
                    <Row
                      label="Asesor"
                      value={
                        property.assignedAgent
                          ? `${property.assignedAgent.firstName} ${property.assignedAgent.lastName ?? ''}`
                          : 'Sin asignar'
                      }
                    />
              </dl>
            </Card>

            <Card
              title={`Portales · ${publications.length}`}
              action={
                editable && (
                  <Button variant="outline" size="sm" onClick={() => setPublishing(true)}>
                    Gestionar
                  </Button>
                )
              }
              flush
            >
              {publications.length === 0 ? (
                <div className="p-5">
                  <Empty title="Sin publicar">
                    Este inmueble no está en ningún portal, así que no lo está viendo nadie.
                  </Empty>
                </div>
              ) : (
                <Table>
                    <TBody>
                      {publications.map((publication) => (
                        <Tr key={publication.id}>
                          <Td>{publication.portal.name}</Td>
                          <Td className="w-[110px]">
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
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              )}
            </Card>

            {property.family && (
              <Card
                title={`Otras unidades de ${property.family.name}`}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/proyectos/${property.familyId}`}>Ver proyecto</Link>
                  </Button>
                }
                flush
              >
                {siblings.length === 0 ? (
                  <div className="p-5">
                    <Empty title="Es la única unidad">
                      Cuando asignes más inmuebles a este proyecto aparecerán aquí para comparar.
                    </Empty>
                  </div>
                ) : (
                  <Table>
                      <TBody>
                        {siblings.map((sibling) => (
                          <Tr key={sibling.id}>
                            <Td className="tabular w-[88px]">
                              <Link
                                to={`/inmuebles/${sibling.id}`}
                                className="hover:underline"
                              >
                                {sibling.code}
                              </Link>
                            </Td>
                            <Td>
                              {sibling.unitType ?? sibling.propertyType.name}
                              <div className="note mt-0.5">
                                {sibling.bedrooms ?? '—'} alcobas · piso {sibling.floor ?? '—'}
                              </div>
                            </Td>
                            <Td num>{area(sibling.area)}</Td>
                            <Td num>{money(sibling.salePrice)}</Td>
                          </Tr>
                        ))}
                      </TBody>
                  </Table>
                )}
              </Card>
            )}

            <Card title={`Clientes vinculados · ${interests.length}`} flush>
              {interests.length === 0 ? (
                <div className="p-5">
                  <Empty title="Nadie interesado todavía">
                    Vincula clientes desde su ficha para hacer seguimiento del inmueble.
                  </Empty>
                </div>
              ) : (
                <Table>
                    <TBody>
                      {interests.map((interest) => (
                        <Tr key={interest.id}>
                          <Td>
                            {interest.client ? (
                              <Link
                                to={`/clientes/${interest.clientId}`}
                                className="hover:underline"
                              >
                                {interest.client.firstName} {interest.client.lastName ?? ''}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </Td>
                          <Td className="w-[110px]">
                            <Badge>{INTEREST_ROLE_LABEL[interest.role]}</Badge>
                          </Td>
                          <Td className="note w-[100px]">
                            {INTEREST_STATUS_LABEL[interest.status]}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      </PageBody>

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

      {linkingFamily && (
        <FamilyModal
          propertyId={id}
          currentFamilyId={property.familyId}
          currentUnitType={property.unitType}
          onClose={() => setLinkingFamily(false)}
          onDone={() => {
            setLinkingFamily(false);
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

/** Una fila de la ficha tecnica: rotulo a la izquierda, dato a la derecha. */
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </div>
  );
}

/** Una cifra con su icono, igual que en la tarjeta del listado. */
function Spec({
  icon: Icon,
  value,
  unit,
}: {
  icon: typeof Ruler;
  value: string | number | null | undefined;
  unit?: string;
}) {
  if (!value) return null;
  const text = unit ? `${value} ${unit}` : String(value);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={text}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="tabular truncate text-foreground">{text}</span>
    </div>
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
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!agentId || agentId === currentAgentId}
            onClick={() => void save()}
          >
            Reasignar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
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
        <Field
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Traslado de cartera, vacaciones…"
          hint="Queda en el histórico del inmueble junto a quien lo captó."
        />
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
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Guardar {selected.length} portal{selected.length === 1 ? '' : 'es'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {error && <Alert>{error}</Alert>}
        {(catalogs.data?.portals ?? []).map((portal) => (
          <CheckField
            key={portal.id}
            checked={selected.includes(portal.id)}
            onChange={() => toggle(portal.id)}
            label={
              <span className="flex items-center gap-2">
                {portal.name}
                {portal.paid && <Badge tone="amber">de pago</Badge>}
                {!portal.connected && <Badge tone="red">sin conectar</Badge>}
              </span>
            }
          />
        ))}
      </div>
    </Modal>
  );
}

/**
 * Vincula el inmueble a un proyecto.
 *
 * La tipologia se pide aqui mismo porque es lo que hace util el agrupamiento:
 * sin ella, veinte apartamentos del mismo conjunto siguen siendo veinte fichas
 * sueltas en vez de "Tipo A, 3 alcobas, 78-84 m²".
 */
function FamilyModal({
  propertyId,
  currentFamilyId,
  currentUnitType,
  onClose,
  onDone,
}: {
  propertyId: string;
  currentFamilyId: string | null;
  currentUnitType: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const families = useFetch<PropertyFamily[]>(
    (signal) => api.get<PropertyFamily[]>('/families', undefined, signal),
    [],
  );
  const [familyId, setFamilyId] = useState(currentFamilyId ?? '');
  const [unitType, setUnitType] = useState(currentUnitType ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/properties/${propertyId}/family`, {
        familyId: familyId || null,
        unitType: unitType.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar el proyecto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Proyecto del inmueble"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <SelectField
          label="Proyecto"
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
          hint="Déjalo sin proyecto si es un inmueble suelto"
        >
          <option value="">Sin proyecto</option>
          {(families.data ?? []).map((family) => (
            <option key={family.id} value={family.id}>
              {family.parentId ? '   └ ' : ''}
              {family.name}
            </option>
          ))}
        </SelectField>

        <Field
          label="Tipología"
          value={unitType}
          onChange={(e) => setUnitType(e.target.value)}
          placeholder="Tipo A"
          disabled={!familyId}
          hint="Agrupa las unidades iguales dentro del proyecto."
        />

        {(families.data ?? []).length === 0 && (
          <Alert tone="warn">
            Todavía no hay proyectos creados. Créalos en Proyectos y vuelve aquí.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
