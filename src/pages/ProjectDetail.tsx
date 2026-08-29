import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  api,
  type Property,
  type PropertyFamily,
  type UnitTypeSummary,
} from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardShell,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PageBody,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';
import { AVAILABILITY_LABEL, area, money, moneyShort, number } from '../lib/format';
import { FAMILY_KIND_LABEL, FAMILY_STATUS_LABEL, ProjectForm } from './Projects';
import { AVAILABILITY_TONE } from './Properties';
import { UnitTypeSelect, UnitTypesCard } from './UnitTypes';

interface Detail {
  family: PropertyFamily;
  unitTypes: UnitTypeSummary[];
  properties: Property[];
  families: PropertyFamily[];
}

export function ProjectDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data, error, loading, reload } = useFetch<Detail>(
    async (signal) => {
      const [family, unitTypes, properties, families] = await Promise.all([
        api.get<PropertyFamily>(`/families/${id}`, undefined, signal),
        api.get<UnitTypeSummary[]>(`/families/${id}/unit-types`, undefined, signal),
        api.get<Property[]>(`/families/${id}/properties`, undefined, signal),
        api.get<PropertyFamily[]>('/families', undefined, signal),
      ]);
      return { family, unitTypes, properties, families };
    },
    [id],
  );

  if (loading) return <Loading rows={8} />;
  if (error || !data) {
    return (
      <PageBody>
        <ErrorNote onRetry={reload}>{error ?? 'Proyecto no encontrado'}</ErrorNote>
      </PageBody>
    );
  }

  const { family, unitTypes, properties } = data;
  const editable = can('ADMIN', 'MANAGER');
  const available = unitTypes.reduce((sum, unit) => sum + unit.available, 0);
  const prices = unitTypes.map((u) => u.minPrice).filter((p): p is number => p !== null);
  // La fila sin `id` es el recuento de lo que falta por clasificar, no una
  // tipologia: contarla diria que el proyecto tiene una tipologia mas de las
  // que la agencia ha escrito.
  const tipologias = unitTypes.filter((unit) => unit.id !== null);

  async function remove() {
    if (!confirm(`¿Borrar el proyecto "${family.name}"? Los inmuebles no se borran.`)) return;
    try {
      await api.delete(`/families/${id}`);
      navigate('/proyectos');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'No se pudo borrar el proyecto.');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={FAMILY_KIND_LABEL[family.kind]}
        title={family.name}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/proyectos')}>
              Volver
            </Button>
            {editable && (
              <>
                <Button variant="destructive" onClick={() => void remove()}>
                  Borrar
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Editar
                </Button>
                <Button onClick={() => setAssigning(true)}>Asignar inmuebles</Button>
              </>
            )}
          </>
        }
      />

      <PageBody>
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <Stat
            label="Unidades nuestras"
            value={number(properties.length)}
            note={`${number(available)} disponibles`}
            tone={available > 0 ? 'green' : 'neutral'}
          />
          <Stat
            label="Tipologías"
            value={number(tipologias.length)}
            note={tipologias.length ? 'en la tabla del proyecto' : 'ninguna escrita todavía'}
          />
          <Stat
            label="Desde"
            value={prices.length ? moneyShort(Math.min(...prices)) : '—'}
            note={family.totalUnits ? `${number(family.totalUnits)} en el proyecto` : 'precio mínimo'}
          />
          <Stat
            label="Estado"
            value={FAMILY_STATUS_LABEL[family.status]}
            note={family.deliveryYear ? `entrega ${family.deliveryYear}` : '—'}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Card title="Ficha">
            <dl className="grid">
                  <Row label="Dirección web" value={`/${family.slug}`} />
                  <Row label="Tipo" value={FAMILY_KIND_LABEL[family.kind]} />
                  <Row label="Constructora" value={family.developer ?? '—'} />
                  <Row
                    label="Ubicación"
                    value={[family.zone?.name, family.city?.name].filter(Boolean).join(', ') || '—'}
                  />
                  <Row label="Dirección" value={family.address ?? '—'} />
                  <Row
                    label="En la web"
                    value={family.published ? 'Visible' : 'Oculto'}
                  />
            </dl>
            {family.description && (
              <p className="mt-4 text-sm whitespace-pre-wrap">{family.description}</p>
            )}
          </Card>

          <UnitTypesCard
            familyId={id}
            summaries={unitTypes}
            editable={editable}
            onChange={reload}
          />
        </div>

        <Card title={`Unidades · ${properties.length}`} flush>
          {properties.length === 0 ? (
            <div className="p-5">
              <Empty
                title="Ningún inmueble asignado"
                action={
                  editable && (
                    <Button onClick={() => setAssigning(true)}>Asignar inmuebles</Button>
                  )
                }
              >
                Busca los inmuebles que pertenecen a este conjunto y asígnalos.
              </Empty>
            </div>
          ) : (
            <Table>
                <THead>
                  <tr>
                    <Th>Código</Th>
                    <Th>Inmueble</Th>
                    <Th>Tipología</Th>
                    <Th num>Área</Th>
                    <Th num hideSm>
                      Alcobas
                    </Th>
                    <Th num>Precio</Th>
                    <Th>Estado</Th>
                    <Th />
                  </tr>
                </THead>
                <TBody>
                  {properties.map((property) => (
                    <Tr key={property.id}>
                      <Td className="tabular">
                        <Link
                          to={`/inmuebles/${property.id}`}
                          className="hover:underline"
                        >
                          {property.code}
                        </Link>
                      </Td>
                      <Td className="max-w-[300px]">{property.title}</Td>
                      <Td>
                        {property.unitType?.name ?? (
                          <span className="note">sin clasificar</span>
                        )}
                      </Td>
                      <Td num>{area(property.area)}</Td>
                      <Td num hideSm>
                        {property.bedrooms ?? '—'}
                      </Td>
                      <Td num>{money(property.salePrice)}</Td>
                      <Td>
                        <Badge tone={AVAILABILITY_TONE[property.availability]}>
                          {AVAILABILITY_LABEL[property.availability]}
                        </Badge>
                      </Td>
                      <Td className="w-[90px]">
                        {editable && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void api
                                .patch(`/properties/${property.id}/family`, { familyId: null })
                                .then(reload);
                            }}
                          >
                            Quitar
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
            </Table>
          )}
        </Card>
      </PageBody>

      {editing && (
        <ProjectForm
          families={data.families}
          existing={family}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            reload();
          }}
        />
      )}

      {assigning && (
        <AssignUnitsModal
          familyId={id}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            reload();
          }}
        />
      )}
    </>
  );
}

/** Una fila de la ficha: rotulo a la izquierda, dato a la derecha. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </div>
  );
}

/**
 * Asignación de unidades al proyecto.
 *
 * La tipología se pide en el mismo paso porque es lo que hace útil el
 * agrupamiento: veinte apartamentos sin «Tipo A» son veinte fichas sueltas.
 */
function AssignUnitsModal({
  familyId,
  onClose,
  onDone,
}: {
  familyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [unitTypeId, setUnitTypeId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(query);

  const results = useFetch<{ data: Property[] }>(
    (signal) =>
      api.get<{ data: Property[] }>(
        '/properties',
        { q: debounced || undefined, limit: 25 },
        signal,
      ),
    [debounced],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      for (const propertyId of selected) {
        /*
          Dos peticiones y en este orden: vincular al proyecto deja al inmueble
          sin tipologia —la que tuviera era de su proyecto anterior— y la API
          solo acepta una tipologia que sea del proyecto al que YA pertenece.
        */
        await api.patch(`/properties/${propertyId}/family`, { familyId });
        if (unitTypeId) {
          await api.patch(`/properties/${propertyId}`, { unitTypeId });
        }
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron asignar los inmuebles.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Asignar inmuebles al proyecto"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={selected.size === 0}
            onClick={() => void save()}
          >
            Asignar {selected.size || ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Field
            label="Buscar inmueble"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Código, título o dirección"
          />
          <UnitTypeSelect
            familyId={familyId}
            value={unitTypeId}
            onChange={setUnitTypeId}
            label="Tipología para todos"
          />
        </div>

        <CardShell className="max-h-90 overflow-y-auto">
          <Table>
            <TBody>
              {(results.data?.data ?? []).map((property) => (
                <Tr key={property.id} onClick={() => toggle(property.id)}>
                  <Td className="w-[34px]">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.has(property.id)}
                      onChange={() => toggle(property.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Td>
                  <Td className="tabular w-[92px]">{property.code}</Td>
                  <Td>
                    {property.title.slice(0, 52)}
                    <div className="note mt-0.5">
                      {property.zone?.name ?? property.city.name}
                      {property.family ? ` · ya en ${property.family.name}` : ''}
                    </div>
                  </Td>
                  <Td num>{area(property.area)}</Td>
                  <Td num>{moneyShort(property.salePrice)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {(results.data?.data ?? []).length === 0 && (
            <p className="note p-4">Ningún inmueble coincide.</p>
          )}
        </CardShell>
      </div>
    </Modal>
  );
}
