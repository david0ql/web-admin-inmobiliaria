import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  api,
  type Catalogs,
  type Property,
  type PropertyLabel,
  type Zone,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  SelectField,
  TextareaField,
} from '../components/ui';
import { AVAILABILITY_LABEL, CONDITION_LABEL, PUBLICATION_LABEL } from '../lib/format';

interface FormState {
  title: string;
  address: string;
  propertyTypeId: string;
  cityId: string;
  zoneId: string;
  currencyId: string;
  forSale: boolean;
  forRent: boolean;
  salePrice: string;
  rentPrice: string;
  maintenanceFee: string;
  area: string;
  builtArea: string;
  privateArea: string;
  bedrooms: string;
  bathrooms: string;
  garages: string;
  floor: string;
  stratum: string;
  condition: string;
  buildingYear: string;
  latitude: string;
  longitude: string;
  availability: string;
  publicationStatus: string;
  labelId: string;
  videoUrl: string;
  tourUrl: string;
  observations: string;
  featureIds: number[];
}

const BLANK: FormState = {
  title: '',
  address: '',
  propertyTypeId: '',
  cityId: '',
  zoneId: '',
  currencyId: '1',
  forSale: true,
  forRent: false,
  salePrice: '',
  rentPrice: '',
  maintenanceFee: '',
  area: '',
  builtArea: '',
  privateArea: '',
  bedrooms: '',
  bathrooms: '',
  garages: '',
  floor: '',
  stratum: '',
  condition: '',
  buildingYear: '',
  latitude: '',
  longitude: '',
  availability: 'AVAILABLE',
  publicationStatus: 'DRAFT',
  labelId: '',
  videoUrl: '',
  tourUrl: '',
  observations: '',
  featureIds: [],
};

/** Convierte "" en undefined para no enviar campos vacíos que la API rechaza. */
const numberOrUndefined = (value: string) =>
  value.trim() === '' ? undefined : Number(value);
const textOrUndefined = (value: string) => (value.trim() === '' ? undefined : value.trim());

export function PropertyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const [form, setForm] = useState<FormState>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalogs = useFetch<Catalogs>(
    (signal) => api.get<Catalogs>('/catalogs/bootstrap', undefined, signal),
    [],
  );
  const labels = useFetch<PropertyLabel[]>(
    (signal) => api.get<PropertyLabel[]>('/properties/labels', undefined, signal),
    [],
  );
  const zones = useFetch<Zone[]>(
    (signal) =>
      form.cityId
        ? api.get<Zone[]>('/catalogs/geo/zones', { cityId: form.cityId }, signal)
        : Promise.resolve([]),
    [form.cityId],
  );
  const existing = useFetch<Property | null>(
    (signal) => (id ? api.get<Property>(`/properties/${id}`, undefined, signal) : Promise.resolve(null)),
    [id],
  );

  useEffect(() => {
    const property = existing.data;
    if (!property) return;
    setForm({
      title: property.title,
      address: property.address ?? '',
      propertyTypeId: String(property.propertyType.id),
      cityId: String(property.city.id),
      zoneId: property.zone ? String(property.zone.id) : '',
      currencyId: String(property.currency.id),
      forSale: property.forSale,
      forRent: property.forRent,
      salePrice: property.salePrice?.toString() ?? '',
      rentPrice: property.rentPrice?.toString() ?? '',
      maintenanceFee: property.maintenanceFee?.toString() ?? '',
      area: property.area?.toString() ?? '',
      builtArea: property.builtArea?.toString() ?? '',
      privateArea: property.privateArea?.toString() ?? '',
      bedrooms: property.bedrooms?.toString() ?? '',
      bathrooms: property.bathrooms?.toString() ?? '',
      garages: property.garages?.toString() ?? '',
      floor: property.floor?.toString() ?? '',
      stratum: property.stratum?.toString() ?? '',
      condition: property.condition ?? '',
      buildingYear: property.buildingYear?.toString() ?? '',
      latitude: property.latitude?.toString() ?? '',
      longitude: property.longitude?.toString() ?? '',
      availability: property.availability,
      publicationStatus: property.publicationStatus,
      labelId: property.label?.id ?? '',
      videoUrl: property.videoUrl ?? '',
      tourUrl: property.tourUrl ?? '',
      observations: property.observations ?? '',
      featureIds: property.features?.map((feature) => feature.id) ?? [],
    });
  }, [existing.data]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFeature(featureId: number) {
    setForm((prev) => ({
      ...prev,
      featureIds: prev.featureIds.includes(featureId)
        ? prev.featureIds.filter((x) => x !== featureId)
        : [...prev.featureIds, featureId],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      address: textOrUndefined(form.address),
      propertyTypeId: Number(form.propertyTypeId),
      cityId: Number(form.cityId),
      zoneId: numberOrUndefined(form.zoneId),
      currencyId: Number(form.currencyId),
      forSale: form.forSale,
      forRent: form.forRent,
      salePrice: numberOrUndefined(form.salePrice),
      rentPrice: numberOrUndefined(form.rentPrice),
      maintenanceFee: numberOrUndefined(form.maintenanceFee),
      area: numberOrUndefined(form.area),
      builtArea: numberOrUndefined(form.builtArea),
      privateArea: numberOrUndefined(form.privateArea),
      bedrooms: numberOrUndefined(form.bedrooms),
      bathrooms: numberOrUndefined(form.bathrooms),
      garages: numberOrUndefined(form.garages),
      floor: numberOrUndefined(form.floor),
      stratum: numberOrUndefined(form.stratum),
      condition: textOrUndefined(form.condition),
      buildingYear: numberOrUndefined(form.buildingYear),
      latitude: numberOrUndefined(form.latitude),
      longitude: numberOrUndefined(form.longitude),
      availability: form.availability,
      publicationStatus: form.publicationStatus,
      labelId: textOrUndefined(form.labelId),
      videoUrl: textOrUndefined(form.videoUrl),
      tourUrl: textOrUndefined(form.tourUrl),
      observations: textOrUndefined(form.observations),
      featureIds: form.featureIds,
    };

    try {
      const saved = editing
        ? await api.patch<Property>(`/properties/${id}`, payload)
        : await api.post<Property>('/properties', payload);
      navigate(`/inmuebles/${saved.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el inmueble.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  if (editing && existing.loading) return <Loading rows={10} />;

  const internal = (catalogs.data?.features ?? []).filter((f) => f.scope === 'INTERNAL');
  const external = (catalogs.data?.features ?? []).filter((f) => f.scope === 'EXTERNAL');

  return (
    <form onSubmit={submit}>
      <PageHeader
        eyebrow={editing ? `Inmueble ${existing.data?.code ?? ''}` : 'Inventario'}
        title={editing ? 'Editar inmueble' : 'Nuevo inmueble'}
        actions={
          <>
            <Button type="button" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {editing ? 'Guardar cambios' : 'Crear inmueble'}
            </Button>
          </>
        }
      />

      <div className="content stack">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card title="Identificación">
          <div className="stack">
            <Field
              label="Título"
              required
              minLength={5}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="APARTAMENTO EN VENTA EN CAÑAVERAL FLORIDABLANCA"
            />
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
            >
              <SelectField
                label="Tipo"
                required
                value={form.propertyTypeId}
                onChange={(e) => set('propertyTypeId', e.target.value)}
              >
                <option value="">Selecciona…</option>
                {(catalogs.data?.propertyTypes ?? []).map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Ciudad"
                required
                value={form.cityId}
                onChange={(e) => {
                  set('cityId', e.target.value);
                  set('zoneId', '');
                }}
              >
                <option value="">Selecciona…</option>
                {(catalogs.data?.cities ?? []).map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Zona / barrio"
                value={form.zoneId}
                onChange={(e) => set('zoneId', e.target.value)}
                disabled={!form.cityId}
                hint={form.cityId ? undefined : 'Elige la ciudad primero'}
              >
                <option value="">Sin especificar</option>
                {(zones.data ?? []).map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Dirección"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Carrera 31 #121-29"
              />
            </div>
          </div>
        </Card>

        <Card title="Negocio y precio">
          <div className="stack">
            <div className="row row-wrap" style={{ gap: 18 }}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.forSale}
                  onChange={(e) => set('forSale', e.target.checked)}
                />
                En venta
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.forRent}
                  onChange={(e) => set('forRent', e.target.checked)}
                />
                En arriendo
              </label>
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
            >
              {form.forSale && (
                <Field
                  label="Precio de venta"
                  type="number"
                  min={0}
                  step={1_000_000}
                  required
                  value={form.salePrice}
                  onChange={(e) => set('salePrice', e.target.value)}
                  hint="En pesos colombianos"
                />
              )}
              {form.forRent && (
                <Field
                  label="Canon de arriendo"
                  type="number"
                  min={0}
                  step={50_000}
                  required
                  value={form.rentPrice}
                  onChange={(e) => set('rentPrice', e.target.value)}
                  hint="Mensual"
                />
              )}
              <Field
                label="Administración"
                type="number"
                min={0}
                step={10_000}
                value={form.maintenanceFee}
                onChange={(e) => set('maintenanceFee', e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card title="Características físicas">
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
          >
            <Field
              label="Área total (m²)"
              type="number"
              min={0}
              value={form.area}
              onChange={(e) => set('area', e.target.value)}
            />
            <Field
              label="Área construida"
              type="number"
              min={0}
              value={form.builtArea}
              onChange={(e) => set('builtArea', e.target.value)}
            />
            <Field
              label="Área privada"
              type="number"
              min={0}
              value={form.privateArea}
              onChange={(e) => set('privateArea', e.target.value)}
            />
            <Field
              label="Alcobas"
              type="number"
              min={0}
              max={99}
              value={form.bedrooms}
              onChange={(e) => set('bedrooms', e.target.value)}
            />
            <Field
              label="Baños"
              type="number"
              min={0}
              max={99}
              value={form.bathrooms}
              onChange={(e) => set('bathrooms', e.target.value)}
            />
            <Field
              label="Garajes"
              type="number"
              min={0}
              max={99}
              value={form.garages}
              onChange={(e) => set('garages', e.target.value)}
            />
            <Field
              label="Piso"
              type="number"
              value={form.floor}
              onChange={(e) => set('floor', e.target.value)}
            />
            <SelectField
              label="Estrato"
              value={form.stratum}
              onChange={(e) => set('stratum', e.target.value)}
            >
              <option value="">Sin especificar</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Estado"
              value={form.condition}
              onChange={(e) => set('condition', e.target.value)}
            >
              <option value="">Sin especificar</option>
              {Object.entries(CONDITION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Field
              label="Año de construcción"
              type="number"
              min={1800}
              max={2100}
              value={form.buildingYear}
              onChange={(e) => set('buildingYear', e.target.value)}
            />
          </div>
        </Card>

        <Card title="Publicación">
          <div className="stack">
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
            >
              <SelectField
                label="Disponibilidad"
                value={form.availability}
                onChange={(e) => set('availability', e.target.value)}
              >
                {Object.entries(AVAILABILITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Visibilidad"
                value={form.publicationStatus}
                onChange={(e) => set('publicationStatus', e.target.value)}
              >
                {Object.entries(PUBLICATION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Etiqueta"
                value={form.labelId}
                onChange={(e) => set('labelId', e.target.value)}
              >
                <option value="">Ninguna</option>
                {(labels.data ?? []).map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </SelectField>
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
            >
              <Field
                label="Vídeo"
                type="url"
                value={form.videoUrl}
                onChange={(e) => set('videoUrl', e.target.value)}
                placeholder="https://youtube.com/…"
              />
              <Field
                label="Recorrido 360"
                type="url"
                value={form.tourUrl}
                onChange={(e) => set('tourUrl', e.target.value)}
                placeholder="https://kuula.co/…"
              />
              <Field
                label="Latitud"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => set('latitude', e.target.value)}
                placeholder="7.084696"
              />
              <Field
                label="Longitud"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => set('longitude', e.target.value)}
                placeholder="-73.106154"
              />
            </div>

            <TextareaField
              label="Descripción"
              value={form.observations}
              onChange={(e) => set('observations', e.target.value)}
              placeholder="Lo que un comprador necesita saber y no se ve en las fotos."
            />
          </div>
        </Card>

        <Card title={`Características · ${form.featureIds.length} seleccionadas`}>
          <div className="stack">
            <div>
              <span className="note">Del inmueble</span>
              <div className="row row-wrap" style={{ gap: 6, marginTop: 8 }}>
                {internal.map((feature) => (
                  <FeatureChip
                    key={feature.id}
                    name={feature.name}
                    active={form.featureIds.includes(feature.id)}
                    onClick={() => toggleFeature(feature.id)}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="note">Del entorno y la copropiedad</span>
              <div className="row row-wrap" style={{ gap: 6, marginTop: 8 }}>
                {external.map((feature) => (
                  <FeatureChip
                    key={feature.id}
                    name={feature.name}
                    active={form.featureIds.includes(feature.id)}
                    onClick={() => toggleFeature(feature.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </form>
  );
}

function FeatureChip({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
    >
      <Badge tone={active ? 'green' : 'neutral'}>{name}</Badge>
    </button>
  );
}
