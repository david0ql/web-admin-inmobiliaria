import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  type Agent,
  type Catalogs,
  type Page,
  type Property,
} from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import { Badge, Button, Empty, ErrorNote, Loading, Pager } from '../components/ui';
import {
  AVAILABILITY_LABEL,
  PUBLICATION_LABEL,
  area,
  money,
  number,
} from '../lib/format';

const AVAILABILITY_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral' | 'blue'> = {
  AVAILABLE: 'green',
  RESERVED: 'blue',
  SOLD: 'neutral',
  RENTED: 'amber',
  WITHDRAWN: 'red',
};

interface Filters {
  q: string;
  cityId: string;
  propertyTypeId: string;
  availability: string;
  minPrice: string;
  maxPrice: string;
  bedrooms: string;
  assignedAgentId: string;
  sort: string;
}

const EMPTY: Filters = {
  q: '',
  cityId: '',
  propertyTypeId: '',
  availability: '',
  minPrice: '',
  maxPrice: '',
  bedrooms: '',
  assignedAgentId: '',
  sort: 'recent',
};

export function Properties() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const debouncedQuery = useDebounced(filters.q);

  const catalogs = useFetch<Catalogs>(
    (signal) => api.get<Catalogs>('/catalogs/bootstrap', undefined, signal),
    [],
  );
  const agents = useFetch<Agent[]>((signal) => api.get<Agent[]>('/agents', undefined, signal), []);

  const query = {
    q: debouncedQuery || undefined,
    cityId: filters.cityId || undefined,
    propertyTypeId: filters.propertyTypeId || undefined,
    availability: filters.availability || undefined,
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
    bedrooms: filters.bedrooms || undefined,
    assignedAgentId: filters.assignedAgentId || undefined,
    sort: filters.sort,
    page,
    limit: 24,
  };

  const { data, error, loading, reload } = useFetch<Page<Property>>(
    (signal) => api.get<Page<Property>>('/properties', query, signal),
    [
      debouncedQuery,
      filters.cityId,
      filters.propertyTypeId,
      filters.availability,
      filters.minPrice,
      filters.maxPrice,
      filters.bedrooms,
      filters.assignedAgentId,
      filters.sort,
      page,
    ],
  );

  function set<K extends keyof Filters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const active = Object.entries(filters).filter(
    ([key, value]) => value && key !== 'sort',
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Inmuebles"
        actions={
          <>
            <div className="row" style={{ gap: 0 }}>
              <Button
                size="sm"
                variant={view === 'grid' ? 'primary' : 'default'}
                onClick={() => setView('grid')}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                Fichas
              </Button>
              <Button
                size="sm"
                variant={view === 'table' ? 'primary' : 'default'}
                onClick={() => setView('table')}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}
              >
                Tabla
              </Button>
            </div>
            {can('ADMIN', 'MANAGER', 'AGENT') && (
              <Button variant="primary" onClick={() => navigate('/inmuebles/nuevo')}>
                Nuevo inmueble
              </Button>
            )}
          </>
        }
      />

      <div className="content stack">
        <div className="filters">
          <label className="field" style={{ flex: '1 1 240px' }}>
            <span>Buscar</span>
            <input
              className="input"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Título, dirección o código"
            />
          </label>

          <label className="field" style={{ flex: '0 1 170px' }}>
            <span>Ciudad</span>
            <select
              className="select"
              value={filters.cityId}
              onChange={(e) => set('cityId', e.target.value)}
            >
              <option value="">Todas</option>
              {(catalogs.data?.cities ?? []).map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: '0 1 160px' }}>
            <span>Tipo</span>
            <select
              className="select"
              value={filters.propertyTypeId}
              onChange={(e) => set('propertyTypeId', e.target.value)}
            >
              <option value="">Todos</option>
              {(catalogs.data?.propertyTypes ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: '0 1 150px' }}>
            <span>Estado</span>
            <select
              className="select"
              value={filters.availability}
              onChange={(e) => set('availability', e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(AVAILABILITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: '0 1 130px' }}>
            <span>Precio desde</span>
            <input
              className="input"
              type="number"
              min={0}
              step={10_000_000}
              value={filters.minPrice}
              onChange={(e) => set('minPrice', e.target.value)}
              placeholder="0"
            />
          </label>

          <label className="field" style={{ flex: '0 1 130px' }}>
            <span>Hasta</span>
            <input
              className="input"
              type="number"
              min={0}
              step={10_000_000}
              value={filters.maxPrice}
              onChange={(e) => set('maxPrice', e.target.value)}
              placeholder="Sin tope"
            />
          </label>

          <label className="field" style={{ flex: '0 1 110px' }}>
            <span>Alcobas</span>
            <select
              className="select"
              value={filters.bedrooms}
              onChange={(e) => set('bedrooms', e.target.value)}
            >
              <option value="">Todas</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </label>

          {can('ADMIN', 'MANAGER', 'VIEWER') && (
            <label className="field" style={{ flex: '0 1 170px' }}>
              <span>Asesor</span>
              <select
                className="select"
                value={filters.assignedAgentId}
                onChange={(e) => set('assignedAgentId', e.target.value)}
              >
                <option value="">Todos</option>
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.firstName} {agent.lastName ?? ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field" style={{ flex: '0 1 160px' }}>
            <span>Orden</span>
            <select
              className="select"
              value={filters.sort}
              onChange={(e) => set('sort', e.target.value)}
            >
              <option value="recent">Más recientes</option>
              <option value="price_desc">Precio: mayor</option>
              <option value="price_asc">Precio: menor</option>
              <option value="area_desc">Área: mayor</option>
              <option value="visits_desc">Más visitados</option>
            </select>
          </label>

          {active > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
              Limpiar {active} filtro{active > 1 ? 's' : ''}
            </Button>
          )}
        </div>

        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && data.data.length === 0 && (
          <div className="card">
            <Empty
              title="Ningún inmueble coincide"
              action={
                active > 0 ? (
                  <Button onClick={() => setFilters(EMPTY)}>Quitar los filtros</Button>
                ) : (
                  can('ADMIN', 'MANAGER', 'AGENT') && (
                    <Button variant="primary" onClick={() => navigate('/inmuebles/nuevo')}>
                      Dar de alta el primero
                    </Button>
                  )
                )
              }
            >
              {active > 0
                ? 'Prueba con un rango de precio más amplio o quita algún filtro.'
                : 'Aquí verás el inventario completo una vez cargues los inmuebles.'}
            </Empty>
          </div>
        )}

        {data && data.data.length > 0 && view === 'grid' && (
          <>
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))' }}
            >
              {data.data.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
            <div className="card">
              <Pager
                page={data.meta.page}
                pages={data.meta.pages}
                total={data.meta.total}
                unit="inmuebles"
                onPage={setPage}
              />
            </div>
          </>
        )}

        {data && data.data.length > 0 && view === 'table' && (
          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Inmueble</th>
                    <th className="hide-sm">Zona</th>
                    <th className="num">Precio</th>
                    <th className="num hide-sm">Área</th>
                    <th className="num hide-sm">Alc.</th>
                    <th>Estado</th>
                    <th className="hide-sm">Asesor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((property) => (
                    <tr
                      key={property.id}
                      className="clickable"
                      onClick={() => navigate(`/inmuebles/${property.id}`)}
                    >
                      <td className="figure">{property.code}</td>
                      <td style={{ maxWidth: 320 }}>
                        <strong>{property.title}</strong>
                        <div className="note" style={{ marginTop: 2 }}>
                          {property.propertyType.name}
                        </div>
                      </td>
                      <td className="hide-sm">
                        {property.zone?.name ?? property.city.name}
                      </td>
                      <td className="num">{money(property.salePrice)}</td>
                      <td className="num hide-sm">{area(property.area)}</td>
                      <td className="num hide-sm">{property.bedrooms ?? '—'}</td>
                      <td>
                        <Badge tone={AVAILABILITY_TONE[property.availability]}>
                          {AVAILABILITY_LABEL[property.availability]}
                        </Badge>
                      </td>
                      <td className="hide-sm">
                        {property.assignedAgent?.firstName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={data.meta.page}
              pages={data.meta.pages}
              total={data.meta.total}
              unit="inmuebles"
              onPage={setPage}
            />
          </div>
        )}
      </div>
    </>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const cover = property.images?.find((image) => image.isMain) ?? property.images?.[0];

  return (
    <Link to={`/inmuebles/${property.id}`} className="prop-card">
      <div className="prop-photo">
        {cover ? (
          <img src={cover.url} alt="" loading="lazy" />
        ) : (
          <span className="note prop-noimg">Sin fotos</span>
        )}
        <span className="prop-code">{property.code}</span>
        <span className="prop-flags">
          {property.label ? (
            <Badge color={property.label.color}>{property.label.name}</Badge>
          ) : (
            <Badge tone={AVAILABILITY_TONE[property.availability]}>
              {AVAILABILITY_LABEL[property.availability]}
            </Badge>
          )}
        </span>
      </div>

      <div className="prop-body">
        <span className="prop-price">{money(property.salePrice ?? property.rentPrice)}</span>
        <span className="prop-title">{property.title}</span>
        <span className="note">
          {property.zone?.name ? `${property.zone.name} · ` : ''}
          {property.city.name}
        </span>

        <div className="prop-specs">
          <span className="prop-spec">
            <b>{property.area ? number(property.area) : '—'}</b>
            <span>m²</span>
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
            <b>{property.stratum ?? '—'}</b>
            <span>estrato</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export { AVAILABILITY_TONE, PUBLICATION_LABEL };
