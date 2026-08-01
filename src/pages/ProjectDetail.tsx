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
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  Stat,
} from '../components/ui';
import { AVAILABILITY_LABEL, area, money, moneyShort, number } from '../lib/format';
import { FAMILY_KIND_LABEL, FAMILY_STATUS_LABEL, ProjectForm } from './Projects';
import { AVAILABILITY_TONE } from './Properties';

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
      <div className="content">
        <ErrorNote onRetry={reload}>{error ?? 'Proyecto no encontrado'}</ErrorNote>
      </div>
    );
  }

  const { family, unitTypes, properties } = data;
  const editable = can('ADMIN', 'MANAGER');
  const available = unitTypes.reduce((sum, unit) => sum + unit.available, 0);
  const prices = unitTypes.map((u) => u.minPrice).filter((p): p is number => p !== null);

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
            <Button onClick={() => navigate('/proyectos')}>Volver</Button>
            {editable && (
              <>
                <Button variant="danger" onClick={() => void remove()}>
                  Borrar
                </Button>
                <Button onClick={() => setEditing(true)}>Editar</Button>
                <Button variant="primary" onClick={() => setAssigning(true)}>
                  Asignar inmuebles
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="content stack">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <Stat
            label="Unidades nuestras"
            value={number(properties.length)}
            note={`${number(available)} disponibles`}
            tone={available > 0 ? 'green' : 'neutral'}
          />
          <Stat
            label="Tipologías"
            value={number(unitTypes.length)}
            note={unitTypes.length ? 'formas distintas' : 'sin clasificar'}
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

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr)' }}>
          <Card title="Ficha" flush>
            <div className="table-wrap">
              <table className="data">
                <tbody>
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
                </tbody>
              </table>
            </div>
            {family.description && (
              <div className="card-body">
                <p style={{ fontSize: 'var(--t-small)', whiteSpace: 'pre-wrap' }}>
                  {family.description}
                </p>
              </div>
            )}
          </Card>

          <Card
            title="Tipologías"
            action={
              <span className="note">Lo que ve el comprador al abrir el proyecto</span>
            }
            flush
          >
            {unitTypes.length === 0 ? (
              <Empty title="Sin unidades asignadas">
                Asigna inmuebles al proyecto y aquí aparecerán agrupados por forma, con su rango
                de área y precio.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tipología</th>
                      <th>Tipo</th>
                      <th className="num">Alcobas</th>
                      <th className="num">Área</th>
                      <th className="num">Desde</th>
                      <th className="num">Disponibles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitTypes.map((unit, index) => (
                      <tr key={`${unit.unitType}-${unit.propertyType}-${index}`}>
                        <td>
                          <strong>{unit.unitType ?? 'Sin clasificar'}</strong>
                        </td>
                        <td>{unit.propertyType}</td>
                        <td className="num">{unit.bedrooms ?? '—'}</td>
                        <td className="num">
                          {unit.minArea === unit.maxArea
                            ? area(unit.minArea)
                            : `${number(unit.minArea)}–${area(unit.maxArea)}`}
                        </td>
                        <td className="num">{moneyShort(unit.minPrice)}</td>
                        <td className="num">
                          {unit.available === 0 ? (
                            <Badge tone="neutral">agotada</Badge>
                          ) : (
                            `${unit.available}/${unit.units}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card title={`Unidades · ${properties.length}`} flush>
          {properties.length === 0 ? (
            <Empty
              title="Ningún inmueble asignado"
              action={
                editable && (
                  <Button variant="primary" onClick={() => setAssigning(true)}>
                    Asignar inmuebles
                  </Button>
                )
              }
            >
              Busca los inmuebles que pertenecen a este conjunto y asígnalos.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Inmueble</th>
                    <th>Tipología</th>
                    <th className="num">Área</th>
                    <th className="num hide-sm">Alcobas</th>
                    <th className="num">Precio</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {properties.map((property) => (
                    <tr key={property.id}>
                      <td className="figure">
                        <Link to={`/inmuebles/${property.id}`}>{property.code}</Link>
                      </td>
                      <td style={{ maxWidth: 300 }}>{property.title}</td>
                      <td>{property.unitType ?? <span className="note">sin clasificar</span>}</td>
                      <td className="num">{area(property.area)}</td>
                      <td className="num hide-sm">{property.bedrooms ?? '—'}</td>
                      <td className="num">{money(property.salePrice)}</td>
                      <td>
                        <Badge tone={AVAILABILITY_TONE[property.availability]}>
                          {AVAILABILITY_LABEL[property.availability]}
                        </Badge>
                      </td>
                      <td style={{ width: 90 }}>
                        {editable && (
                          <Button
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="note" style={{ width: '45%' }}>
        {label}
      </td>
      <td>{value}</td>
    </tr>
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
  const [unitType, setUnitType] = useState('');
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
        await api.patch(`/properties/${propertyId}/family`, {
          familyId,
          unitType: unitType.trim() || undefined,
        });
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
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={selected.size === 0}
            onClick={() => void save()}
          >
            Asignar {selected.size || ''}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}

        <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
          <Field
            label="Buscar inmueble"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Código, título o dirección"
          />
          <Field
            label="Tipología"
            value={unitType}
            onChange={(e) => setUnitType(e.target.value)}
            placeholder="Tipo A"
            hint="Se aplica a todos los seleccionados"
          />
        </div>

        <div className="card" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="data">
            <tbody>
              {(results.data?.data ?? []).map((property) => (
                <tr key={property.id} className="clickable" onClick={() => toggle(property.id)}>
                  <td style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(property.id)}
                      onChange={() => toggle(property.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="figure" style={{ width: 92 }}>
                    {property.code}
                  </td>
                  <td>
                    {property.title.slice(0, 52)}
                    <div className="note" style={{ marginTop: 2 }}>
                      {property.zone?.name ?? property.city.name}
                      {property.family ? ` · ya en ${property.family.name}` : ''}
                    </div>
                  </td>
                  <td className="num">{area(property.area)}</td>
                  <td className="num">{moneyShort(property.salePrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(results.data?.data ?? []).length === 0 && (
            <p className="note" style={{ padding: 16 }}>
              Ningún inmueble coincide.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
