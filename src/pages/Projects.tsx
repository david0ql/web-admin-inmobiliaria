import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  api,
  type Catalogs,
  type FamilyKind,
  type FamilyStatus,
  type PropertyFamily,
  type Zone,
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
  TextareaField,
  Th,
  THead,
  Tr,
} from '../components/ui';
import { number } from '../lib/format';

export const FAMILY_KIND_LABEL: Record<FamilyKind, string> = {
  PROJECT: 'Proyecto',
  COMPLEX: 'Conjunto',
  BUILDING: 'Edificio',
  STAGE: 'Etapa / torre',
};

export const FAMILY_STATUS_LABEL: Record<FamilyStatus, string> = {
  PLANNED: 'Sobre planos',
  UNDER_CONSTRUCTION: 'En construcción',
  DELIVERED: 'Entregado',
  SOLD_OUT: 'Agotado',
};

const STATUS_TONE: Record<FamilyStatus, 'green' | 'amber' | 'blue' | 'neutral'> = {
  PLANNED: 'blue',
  UNDER_CONSTRUCTION: 'amber',
  DELIVERED: 'green',
  SOLD_OUT: 'neutral',
};

export function Projects() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const { data, error, loading, reload } = useFetch<PropertyFamily[]>(
    (signal) => api.get<PropertyFamily[]>('/families', { q: q || undefined }, signal),
    [q],
  );

  // Las etapas se muestran anidadas bajo su proyecto, no como filas sueltas:
  // "Torre 2" sin su conjunto no significa nada.
  const roots = (data ?? []).filter((family) => !family.parentId);
  const stagesOf = (id: string) => (data ?? []).filter((family) => family.parentId === id);

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Proyectos"
        actions={
          can('ADMIN', 'MANAGER') && (
            <Button onClick={() => setCreating(true)}>Nuevo proyecto</Button>
          )
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field
            label="Buscar"
            className="col-span-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre del conjunto o proyecto"
          />
        </div>

        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={5} />}

        {data && data.length === 0 && (
          <Empty
            title="Todavía no hay proyectos"
            action={
              can('ADMIN', 'MANAGER') && (
                <Button onClick={() => setCreating(true)}>Crear el primero</Button>
              )
            }
          >
            Un proyecto agrupa las unidades de un mismo conjunto. Sirve para comparar sus
            tipologías —«Tipo A, 3 alcobas, 78–84 m², desde $320 M»— y para que desde una ficha
            se vea qué más hay en el mismo sitio.
          </Empty>
        )}

        {data && data.length > 0 && (
          <Card flush>
            <Table>
              <THead>
                <tr>
                  <Th>Proyecto</Th>
                  <Th>Tipo</Th>
                  <Th>Estado</Th>
                  <Th hideSm>Ubicación</Th>
                  <Th hideSm>Constructora</Th>
                  <Th num>Unidades</Th>
                  <Th num hideSm>
                    Entrega
                  </Th>
                  <Th>Web</Th>
                </tr>
              </THead>
              <TBody>
                {roots.map((family) => (
                  <ProjectRows
                    key={family.id}
                    family={family}
                    stages={stagesOf(family.id)}
                    onOpen={(id) => navigate(`/proyectos/${id}`)}
                  />
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </PageBody>

      {creating && (
        <ProjectForm
          families={data ?? []}
          onClose={() => setCreating(false)}
          onDone={(family) => {
            setCreating(false);
            navigate(`/proyectos/${family.id}`);
          }}
        />
      )}
    </>
  );
}

function ProjectRows({
  family,
  stages,
  onOpen,
}: {
  family: PropertyFamily;
  stages: PropertyFamily[];
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <Row family={family} onOpen={onOpen} />
      {stages.map((stage) => (
        <Row key={stage.id} family={stage} onOpen={onOpen} nested />
      ))}
    </>
  );
}

function Row({
  family,
  onOpen,
  nested,
}: {
  family: PropertyFamily;
  onOpen: (id: string) => void;
  nested?: boolean;
}) {
  return (
    <Tr onClick={() => onOpen(family.id)}>
      {/* La sangria de la etapa es lo unico que dice que cuelga del proyecto. */}
      <Td className={nested ? 'pl-8' : undefined}>
        {nested && <span className="note">└ </span>}
        <strong className="font-medium">{family.name}</strong>
        <div className="note mt-0.5">/{family.slug}</div>
      </Td>
      <Td>
        <Badge>{FAMILY_KIND_LABEL[family.kind]}</Badge>
      </Td>
      <Td>
        <Badge tone={STATUS_TONE[family.status]}>{FAMILY_STATUS_LABEL[family.status]}</Badge>
      </Td>
      <Td hideSm>
        {[family.zone?.name, family.city?.name].filter(Boolean).join(', ') || '—'}
      </Td>
      <Td hideSm>{family.developer ?? '—'}</Td>
      <Td num>{family.totalUnits ? number(family.totalUnits) : '—'}</Td>
      <Td num hideSm>
        {family.deliveryYear ?? '—'}
      </Td>
      <Td>
        {family.published ? (
          <Badge tone="green">visible</Badge>
        ) : (
          <Badge tone="neutral">oculto</Badge>
        )}
      </Td>
    </Tr>
  );
}

export function ProjectForm({
  families,
  existing,
  onClose,
  onDone,
}: {
  families: PropertyFamily[];
  existing?: PropertyFamily;
  onClose: () => void;
  onDone: (family: PropertyFamily) => void;
}) {
  const catalogs = useFetch<Catalogs>(
    (signal) => api.get<Catalogs>('/catalogs/bootstrap', undefined, signal),
    [],
  );

  const [form, setForm] = useState({
    name: existing?.name ?? '',
    kind: existing?.kind ?? ('COMPLEX' as FamilyKind),
    status: existing?.status ?? ('DELIVERED' as FamilyStatus),
    developer: existing?.developer ?? '',
    cityId: existing?.cityId ? String(existing.cityId) : '',
    zoneId: existing?.zoneId ? String(existing.zoneId) : '',
    address: existing?.address ?? '',
    deliveryYear: existing?.deliveryYear ? String(existing.deliveryYear) : '',
    totalUnits: existing?.totalUnits ? String(existing.totalUnits) : '',
    parentId: existing?.parentId ?? '',
    description: existing?.description ?? '',
    published: existing?.published ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const zones = useFetch<Zone[]>(
    (signal) =>
      form.cityId
        ? api.get<Zone[]>('/catalogs/geo/zones', { cityId: form.cityId }, signal)
        : Promise.resolve([]),
    [form.cityId],
  );

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      status: form.status,
      developer: form.developer.trim() || undefined,
      cityId: form.cityId ? Number(form.cityId) : undefined,
      zoneId: form.zoneId ? Number(form.zoneId) : undefined,
      address: form.address.trim() || undefined,
      deliveryYear: form.deliveryYear ? Number(form.deliveryYear) : undefined,
      totalUnits: form.totalUnits ? Number(form.totalUnits) : undefined,
      parentId: form.parentId || undefined,
      description: form.description.trim() || undefined,
      published: form.published,
    };
    try {
      const saved = existing
        ? await api.patch<PropertyFamily>(`/families/${existing.id}`, payload)
        : await api.post<PropertyFamily>('/families', payload);
      onDone(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el proyecto.');
    } finally {
      setBusy(false);
    }
  }

  // Un proyecto no puede colgar de sí mismo ni de una de sus etapas.
  const parentOptions = families.filter(
    (family) => family.id !== existing?.id && family.parentId !== existing?.id,
  );

  return (
    <Modal
      title={existing ? 'Editar proyecto' : 'Nuevo proyecto'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={form.name.trim().length < 3}
            onClick={() => void save()}
          >
            {existing ? 'Guardar cambios' : 'Crear proyecto'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field
          label="Nombre"
          required
          autoFocus
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Reserva de la Loma"
          hint="La dirección web se genera desde el nombre"
        />

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <SelectField
            label="Tipo"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as FamilyKind })}
          >
            {Object.entries(FAMILY_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Estado"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as FamilyStatus })}
          >
            {Object.entries(FAMILY_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Es etapa de"
            value={form.parentId}
            onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            hint="Déjalo vacío si es el proyecto principal"
          >
            <option value="">Ninguno</option>
            {parentOptions.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Constructora"
            value={form.developer}
            onChange={(e) => setForm({ ...form, developer: e.target.value })}
          />
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <SelectField
            label="Ciudad"
            value={form.cityId}
            onChange={(e) => setForm({ ...form, cityId: e.target.value, zoneId: '' })}
          >
            <option value="">Sin especificar</option>
            {(catalogs.data?.cities ?? []).map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Zona / barrio"
            value={form.zoneId}
            onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
            disabled={!form.cityId}
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
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Field
            label="Año de entrega"
            type="number"
            min={1900}
            max={2100}
            value={form.deliveryYear}
            onChange={(e) => setForm({ ...form, deliveryYear: e.target.value })}
          />
          <Field
            label="Total de unidades"
            type="number"
            min={1}
            value={form.totalUnits}
            onChange={(e) => setForm({ ...form, totalUnits: e.target.value })}
            hint="Las del proyecto entero, no solo las nuestras"
          />
        </div>

        <TextareaField
          label="Descripción"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Lo que distingue a este proyecto: zonas comunes, ubicación, acabados."
        />

        <CheckField
          label="Visible en la web pública"
          checked={form.published}
          onChange={(e) => setForm({ ...form, published: e.target.checked })}
        />
      </div>
    </Modal>
  );
}
