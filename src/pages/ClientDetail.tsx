import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  api,
  type Client,
  type Pipeline,
  type Property,
  type PropertyInterest,
  type TimelineEntry,
} from '../lib/api';
import { useDebounced, useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import { PortalAccess } from '../components/PortalAccess';
import {
  Alert,
  Avatar,
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
  SelectField,
  Table,
  TBody,
  Td,
  TextareaField,
  Timeline,
  TimelineItem,
  Tr,
} from '../components/ui';
import {
  ACTIVITY_LABEL,
  APPOINTMENT_TYPE_LABEL,
  INTEREST_ROLE_LABEL,
  INTEREST_STATUS_LABEL,
  date,
  dateTime,
  money,
  relative,
} from '../lib/format';
import { cn } from '../lib/utils';

interface Detail {
  client: Client;
  timeline: TimelineEntry[];
  interests: PropertyInterest[];
  pipelines: Pipeline[];
}

const ACTIVITY_MARK: Record<string, string> = {
  NOTE: '✎',
  CALL: '☎',
  WHATSAPP: '✆',
  EMAIL: '✉',
  VISIT: '⌂',
  OFFER: '$',
  STAGE_CHANGE: '→',
  ASSIGNMENT: '⇄',
};

export function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [logging, setLogging] = useState(false);
  const [linking, setLinking] = useState(false);
  const [moving, setMoving] = useState(false);

  const { data, error, loading, reload } = useFetch<Detail>(
    async (signal) => {
      const [client, timeline, interests, pipelines] = await Promise.all([
        api.get<Client>(`/clients/${id}`, undefined, signal),
        api.get<TimelineEntry[]>(`/clients/${id}/timeline`, undefined, signal),
        api.get<PropertyInterest[]>(`/clients/${id}/interests`, undefined, signal),
        api.get<Pipeline[]>('/pipelines', undefined, signal),
      ]);
      return { client, timeline, interests, pipelines };
    },
    [id],
  );

  if (loading) return <Loading rows={8} />;
  if (error || !data) {
    return (
      <PageBody>
        <ErrorNote onRetry={reload}>{error ?? 'Cliente no encontrado'}</ErrorNote>
      </PageBody>
    );
  }

  const { client, timeline, interests, pipelines } = data;
  const editable = can('ADMIN', 'MANAGER', 'AGENT');
  const fullName = `${client.firstName} ${client.lastName ?? ''}`.trim();
  const phone = client.cellPhone ?? client.phone;

  return (
    <>
      <PageHeader
        eyebrow={client.pipeline.name}
        title={fullName}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/clientes')}>
              Volver
            </Button>
            {phone && (
              <Button asChild variant="outline">
                <a
                  href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outline" onClick={() => setLinking(true)}>
                  Vincular inmueble
                </Button>
                <Button variant="outline" onClick={() => setMoving(true)}>
                  Mover de etapa
                </Button>
                <Button onClick={() => setLogging(true)}>Registrar gestión</Button>
              </>
            )}
          </>
        }
      />

      <PageBody>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col gap-5">
            <Card>
              <div className="mb-3.5 flex items-center gap-3">
                <Avatar name={fullName} large />
                <div className="min-w-0">
                  <strong className="block font-medium">{fullName}</strong>
                  <span className="note">
                    Alta {date(client.createdAt)} · {relative(client.createdAt)}
                  </span>
                </div>
              </div>

              <div className="mb-3.5 flex flex-wrap gap-1.5">
                <Badge color={client.stage.color}>{client.stage.name}</Badge>
                {client.types.map((type) => (
                  <Badge key={type.id}>{type.name}</Badge>
                ))}
                {client.source && <Badge tone="blue">{client.source.name}</Badge>}
              </div>

              <dl className="grid">
                    <Row label="Celular" value={client.cellPhone ?? '—'} mono />
                    <Row label="Teléfono" value={client.phone ?? '—'} mono />
                    <Row label="Correo" value={client.email ?? '—'} />
                    <Row label="Cédula" value={client.identification ?? '—'} mono />
                    <Row label="Ciudad" value={client.city?.name ?? '—'} />
                    <Row
                      label="Asesor"
                      value={
                        client.assignedAgent
                          ? `${client.assignedAgent.firstName} ${client.assignedAgent.lastName ?? ''}`
                          : 'Sin asignar'
                      }
                    />
                    <Row
                      label="Último contacto"
                      value={client.lastContactedAt ? relative(client.lastContactedAt) : 'nunca'}
                    />
                    <Row
                      label="En esta etapa"
                      value={client.stageChangedAt ? relative(client.stageChangedAt) : '—'}
                    />
              </dl>
            </Card>

            {client.requirement && (
              <Card title="Qué busca">
                <p className="text-sm whitespace-pre-wrap">{client.requirement}</p>
              </Card>
            )}

            {client.notes && (
              <Card title="Notas heredadas de WASI">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {client.notes}
                </p>
              </Card>
            )}

            <PortalAccess clientId={client.id} />

            <Card title={`Inmuebles vinculados · ${interests.length}`} flush>
              {interests.length === 0 ? (
                <div className="p-5">
                  <Empty title="Sin inmuebles">
                    Vincula los que le has mostrado para no perder el hilo del seguimiento.
                  </Empty>
                </div>
              ) : (
                <Table>
                    <TBody>
                      {interests.map((interest) => (
                        <Tr key={interest.id}>
                          <Td>
                            {interest.property ? (
                              <Link
                                to={`/inmuebles/${interest.propertyId}`}
                                className="hover:underline"
                              >
                                <strong className="tabular font-medium">
                                  {interest.property.code}
                                </strong>
                                <div className="note mt-0.5">
                                  {interest.property.title.slice(0, 46)}
                                </div>
                              </Link>
                            ) : (
                              '—'
                            )}
                          </Td>
                          <Td className="w-[100px]">
                            <Badge>{INTEREST_ROLE_LABEL[interest.role]}</Badge>
                          </Td>
                          <Td className="note w-[88px]">
                            {INTEREST_STATUS_LABEL[interest.status]}
                          </Td>
                          <Td num className="w-[110px]">
                            {interest.offeredAmount ? money(interest.offeredAmount) : ''}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                </Table>
              )}
            </Card>
          </div>

          <Card title="Historial" flush>
            {timeline.length === 0 ? (
              <div className="p-5">
                <Empty title="Sin gestiones registradas">
                  Cada llamada, visita o nota que anotes queda aquí en orden.
                </Empty>
              </div>
            ) : (
              <div className="p-5">
                <Timeline>
                  {timeline.map((entry) => (
                    <TimelineItem
                      key={`${entry.kind}-${entry.id}`}
                      mark={
                        entry.kind === 'appointment'
                          ? '◷'
                          : (ACTIVITY_MARK[entry.type] ?? '·')
                      }
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <strong className="text-sm font-medium">{entry.summary}</strong>
                        <span className="note whitespace-nowrap">{relative(entry.at)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge tone={entry.automatic ? 'neutral' : 'blue'}>
                          {entry.kind === 'appointment'
                            ? APPOINTMENT_TYPE_LABEL[entry.type]
                            : (ACTIVITY_LABEL[entry.type] ?? entry.type)}
                        </Badge>
                        <span className="note">{dateTime(entry.at)}</span>
                      </div>
                      {entry.detail && (
                        <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">
                          {entry.detail}
                        </p>
                      )}
                    </TimelineItem>
                  ))}
                </Timeline>
              </div>
            )}
          </Card>
        </div>
      </PageBody>

      {logging && (
        <LogActivityModal
          clientId={id}
          onClose={() => setLogging(false)}
          onDone={() => {
            setLogging(false);
            reload();
          }}
        />
      )}

      {linking && (
        <LinkPropertyModal
          clientId={id}
          onClose={() => setLinking(false)}
          onDone={() => {
            setLinking(false);
            reload();
          }}
        />
      )}

      {moving && (
        <MoveStageModal
          clientId={id}
          pipelines={pipelines}
          currentStageId={client.stageId}
          onClose={() => setMoving(false)}
          onDone={() => {
            setMoving(false);
            reload();
          }}
        />
      )}
    </>
  );
}

/** Una fila de la ficha: rotulo a la izquierda, dato a la derecha. */
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium', mono && 'tabular')}>{value}</dd>
    </div>
  );
}

function LogActivityModal({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState('CALL');
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/activities', {
        type,
        clientId,
        summary: summary.trim(),
        detail: detail.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar la gestión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Registrar gestión"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!summary.trim()}
            onClick={() => void save()}
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <SelectField label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
          {['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'OFFER'].map((value) => (
            <option key={value} value={value}>
              {ACTIVITY_LABEL[value]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Resumen"
          required
          autoFocus
          maxLength={300}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Le envié tres opciones en Cañaveral"
        />
        <TextareaField
          label="Detalle"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Lo que hará falta recordar dentro de dos meses."
        />
      </div>
    </Modal>
  );
}

function LinkPropertyModal({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Property | null>(null);
  const [role, setRole] = useState('PROSPECT');
  const [offered, setOffered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(query);

  const results = useFetch<{ data: Property[] }>(
    (signal) =>
      debounced.trim().length < 2
        ? Promise.resolve({ data: [] })
        : api.get<{ data: Property[] }>('/properties', { q: debounced, limit: 8 }, signal),
    [debounced],
  );

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/clients/${clientId}/interests`, {
        propertyId: selected.id,
        role,
        offeredAmount: offered ? Number(offered) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo vincular el inmueble.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Vincular inmueble"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!selected} onClick={() => void save()}>
            Vincular
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field
          label="Buscar inmueble"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Código, título o dirección"
          hint="Escribe al menos dos caracteres"
        />

        {selected ? (
          <CardShell>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <strong className="tabular font-medium">{selected.code}</strong>
                <div className="note mt-0.5">{selected.title.slice(0, 60)}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Cambiar
              </Button>
            </div>
          </CardShell>
        ) : (
          (results.data?.data ?? []).length > 0 && (
            <CardShell className="max-h-[220px] overflow-y-auto">
              <Table>
                <TBody>
                  {results.data?.data.map((property) => (
                    <Tr key={property.id} onClick={() => setSelected(property)}>
                      <Td className="tabular w-[90px]">{property.code}</Td>
                      <Td>{property.title.slice(0, 48)}</Td>
                      <Td num>{money(property.salePrice)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardShell>
          )
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Rol" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(INTEREST_ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <Field
            label="Oferta"
            type="number"
            min={0}
            step={1_000_000}
            value={offered}
            onChange={(e) => setOffered(e.target.value)}
            hint="Si ya hizo una"
          />
        </div>
      </div>
    </Modal>
  );
}

function MoveStageModal({
  clientId,
  pipelines,
  currentStageId,
  onClose,
  onDone,
}: {
  clientId: string;
  pipelines: Pipeline[];
  currentStageId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stageId, setStageId] = useState(currentStageId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/clients/${clientId}/stage`, { stageId, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo mover al cliente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Mover de etapa"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={stageId === currentStageId}
            onClick={() => void save()}
          >
            Mover
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <SelectField label="Etapa" value={stageId} onChange={(e) => setStageId(e.target.value)}>
          {pipelines.map((pipeline) => (
            <optgroup key={pipeline.id} label={pipeline.name}>
              {pipeline.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <Field
          label="Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Por qué cambia de etapa"
          hint="Queda registrada en el historial"
        />
      </div>
    </Modal>
  );
}
