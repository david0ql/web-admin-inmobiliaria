import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bath, BedDouble, Car, Ruler } from 'lucide-react';
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
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  PageBody,
  Pager,
  SelectField,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  TagBadge,
} from '../components/ui';
import { cn } from '../lib/utils';
import {
  AVAILABILITY_COLOR,
  AVAILABILITY_LABEL,
  PUBLICATION_LABEL,
  area,
  money,
} from '../lib/format';

const AVAILABILITY_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral' | 'blue'> = {
  AVAILABLE: 'green',
  RESERVED: 'blue',
  SOLD: 'neutral',
  RENTED: 'amber',
  WITHDRAWN: 'red',
};

/** La fila de pastillas: la seleccionada es negra maciza, como en web-sell. */
const PILL =
  'h-9 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-secondary';
const PILL_ON = 'border-primary bg-primary text-primary-foreground hover:bg-primary/90';

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
            <div className="flex gap-1.5">
              <button
                type="button"
                className={cn(PILL, view === 'grid' && PILL_ON)}
                onClick={() => setView('grid')}
              >
                Fichas
              </button>
              <button
                type="button"
                className={cn(PILL, view === 'table' && PILL_ON)}
                onClick={() => setView('table')}
              >
                Tabla
              </button>
            </div>
            {can('ADMIN', 'MANAGER', 'AGENT') && (
              <Button onClick={() => navigate('/inmuebles/nuevo')}>Nuevo inmueble</Button>
            )}
          </>
        }
      />

      <PageBody>
        {/*
          Rejilla y no una fila flexible con anchos a mano: los diez filtros
          cabian en una linea a 1400px y se apilaban de cualquier manera en
          movil. Asi hay dos columnas en el telefono y seis en escritorio.
        */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field
            label="Buscar"
            className="col-span-2"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Título, dirección o código"
          />

          <SelectField
            label="Ciudad"
            value={filters.cityId}
            onChange={(e) => set('cityId', e.target.value)}
          >
            <option value="">Todas</option>
            {(catalogs.data?.cities ?? []).map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Tipo"
            value={filters.propertyTypeId}
            onChange={(e) => set('propertyTypeId', e.target.value)}
          >
            <option value="">Todos</option>
            {(catalogs.data?.propertyTypes ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Estado"
            value={filters.availability}
            onChange={(e) => set('availability', e.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(AVAILABILITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>

          <Field
            label="Precio desde"
            type="number"
            min={0}
            step={10_000_000}
            value={filters.minPrice}
            onChange={(e) => set('minPrice', e.target.value)}
            placeholder="0"
          />

          <Field
            label="Hasta"
            type="number"
            min={0}
            step={10_000_000}
            value={filters.maxPrice}
            onChange={(e) => set('maxPrice', e.target.value)}
            placeholder="Sin tope"
          />

          <SelectField
            label="Alcobas"
            value={filters.bedrooms}
            onChange={(e) => set('bedrooms', e.target.value)}
          >
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </SelectField>

          {can('ADMIN', 'MANAGER', 'VIEWER') && (
            <SelectField
              label="Asesor"
              value={filters.assignedAgentId}
              onChange={(e) => set('assignedAgentId', e.target.value)}
            >
              <option value="">Todos</option>
              {(agents.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.firstName} {agent.lastName ?? ''}
                </option>
              ))}
            </SelectField>
          )}

          <SelectField
            label="Orden"
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value)}
          >
            <option value="recent">Más recientes</option>
            <option value="price_desc">Precio: mayor</option>
            <option value="price_asc">Precio: menor</option>
            <option value="area_desc">Área: mayor</option>
            <option value="visits_desc">Más visitados</option>
          </SelectField>

          {active > 0 && (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
                Limpiar {active} filtro{active > 1 ? 's' : ''}
              </Button>
            </div>
          )}
        </div>

        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {data && data.data.length === 0 && (
          <Empty
            title="Ningún inmueble coincide"
            action={
              active > 0 ? (
                <Button variant="outline" onClick={() => setFilters(EMPTY)}>
                  Quitar los filtros
                </Button>
              ) : (
                can('ADMIN', 'MANAGER', 'AGENT') && (
                  <Button onClick={() => navigate('/inmuebles/nuevo')}>
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
        )}

        {data && data.data.length > 0 && view === 'grid' && (
          <>
            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {data.data.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
            <Card flush>
              <Pager
                page={data.meta.page}
                pages={data.meta.pages}
                total={data.meta.total}
                unit="inmuebles"
                onPage={setPage}
              />
            </Card>
          </>
        )}

        {data && data.data.length > 0 && view === 'table' && (
          <Card flush>
            <Table>
              <THead>
                <tr>
                  <Th>Código</Th>
                  <Th>Inmueble</Th>
                  <Th hideSm>Zona</Th>
                  <Th num>Precio</Th>
                  <Th num hideSm>
                    Área
                  </Th>
                  <Th num hideSm>
                    Alc.
                  </Th>
                  <Th>Estado</Th>
                  <Th hideSm>Asesor</Th>
                </tr>
              </THead>
              <TBody>
                {data.data.map((property) => (
                  <Tr
                    key={property.id}
                    onClick={() => navigate(`/inmuebles/${property.id}`)}
                  >
                    <Td className="tabular">{property.code}</Td>
                    <Td className="max-w-80">
                      <strong className="font-medium">{property.title}</strong>
                      <div className="note mt-0.5">{property.propertyType.name}</div>
                    </Td>
                    <Td hideSm>{property.zone?.name ?? property.city.name}</Td>
                    <Td num>{money(property.salePrice)}</Td>
                    <Td num hideSm>
                      {area(property.area)}
                    </Td>
                    <Td num hideSm>
                      {property.bedrooms ?? '—'}
                    </Td>
                    <Td>
                      <Badge tone={AVAILABILITY_TONE[property.availability]}>
                        {AVAILABILITY_LABEL[property.availability]}
                      </Badge>
                    </Td>
                    <Td hideSm>{property.assignedAgent?.firstName ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pager
              page={data.meta.page}
              pages={data.meta.pages}
              total={data.meta.total}
              unit="inmuebles"
              onPage={setPage}
            />
          </Card>
        )}
      </PageBody>
    </>
  );
}

/**
 * La ficha del listado, con la misma anatomia que la del sitio publico: foto de
 * alto fijo con la etiqueta de estado encima, franja de cifras sobre gris,
 * tipo, titulo a dos lineas, banda de precio y pie negro.
 *
 * El alto fijo de la foto no es capricho — las imagenes vienen de WASI con
 * proporciones muy distintas y sin el la rejilla baila.
 */
function PropertyCard({ property }: { property: Property }) {
  const to = `/inmuebles/${property.id}`;
  const cover = property.images?.find((image) => image.isMain) ?? property.images?.[0];

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
      <figure className="relative m-0">
        <Link to={to} className="block">
          <div className="relative h-[220px] overflow-hidden bg-secondary">
            {cover ? (
              <img
                src={cover.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                Sin fotografía
              </div>
            )}

            {/* La cortina con el boton centrado solo aparece donde hay raton. */}
            <div className="absolute inset-0 hidden items-center justify-center bg-black/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100 lg:flex">
              <span className="rounded-sm border-2 border-white px-3 py-2 text-xs font-bold tracking-wide text-white uppercase">
                Ver detalles
              </span>
            </div>
          </div>
        </Link>

        <div className="absolute top-2.5 left-2.5">
          {property.label ? (
            <Badge color={property.label.color}>{property.label.name}</Badge>
          ) : (
            <TagBadge color={AVAILABILITY_COLOR[property.availability] ?? '#767676'}>
              {AVAILABILITY_LABEL[property.availability] ?? property.availability}
            </TagBadge>
          )}
        </div>
      </figure>

      {/*
        Dos columnas siempre. A tres tarjetas por fila, cuatro columnas dejan
        80px por celda y "estrato" no cabe; el icono ya dice de que se habla.
      */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b bg-secondary/50 px-4 py-3 text-xs">
        <Spec icon={Ruler} value={property.area ? area(property.area) : null} />
        <Spec
          icon={BedDouble}
          value={property.bedrooms}
          unit={property.bedrooms === 1 ? 'alcoba' : 'alcobas'}
        />
        <Spec
          icon={Bath}
          value={property.bathrooms}
          unit={property.bathrooms === 1 ? 'baño' : 'baños'}
        />
        <Spec
          icon={Car}
          value={property.garages}
          unit={property.garages === 1 ? 'garaje' : 'garajes'}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {property.propertyType?.name ?? 'Inmueble'}
        </p>
        <h2 className="line-clamp-2-title text-sm leading-snug font-semibold uppercase">
          <Link to={to} className="hover:underline">
            {property.title}
          </Link>
        </h2>
        <p className="line-clamp-2-title text-xs text-muted-foreground">
          Código: {property.code}
          {property.zone ? ` · ${property.zone.name}` : ''}
          {property.city ? ` · ${property.city.name}` : ''}
          {property.stratum ? ` · Estrato ${property.stratum}` : ''}
        </p>
      </div>

      <div className="border-t px-4 py-3">
        <p className="tabular text-xl leading-none font-normal tracking-tight">
          {money(property.salePrice ?? property.rentPrice)}{' '}
          <small className="text-[0.625rem] tracking-widest text-muted-foreground uppercase">
            COP
          </small>
        </p>
      </div>

      <Link
        to={to}
        className="border-t bg-primary py-3 text-center text-xs font-bold tracking-widest text-primary-foreground uppercase transition-opacity hover:opacity-90"
      >
        Detalle
      </Link>
    </article>
  );
}

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

export { AVAILABILITY_TONE, PUBLICATION_LABEL };
