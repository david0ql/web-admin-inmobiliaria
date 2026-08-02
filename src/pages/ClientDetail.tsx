import { useState } from 'react';
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
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  SelectField,
  TextareaField,
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
      <div className="content">
        <ErrorNote onRetry={reload}>{error ?? 'Cliente no encontrado'}</ErrorNote>
      </div>
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
            <Button onClick={() => navigate('/clientes')}>Volver</Button>
            {phone && (
              <a
                className="btn"
                href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                WhatsApp
              </a>
            )}
            {editable && (
              <>
                <Button onClick={() => setLinking(true)}>Vincular inmueble</Button>
                <Button onClick={() => setMoving(true)}>Mover de etapa</Button>
                <Button variant="primary" onClick={() => setLogging(true)}>
                  Registrar gestión
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="content stack">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}>
          <div className="stack">
            <Card>
              <div className="row" style={{ gap: 12, marginBottom: 14 }}>
                <Avatar name={fullName} large />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{fullName}</strong>
                  <span className="note">
                    Alta {date(client.createdAt)} · {relative(client.createdAt)}
                  </span>
                </div>
              </div>

              <div className="row row-wrap" style={{ gap: 6, marginBottom: 14 }}>
                <Badge color={client.stage.color}>{client.stage.name}</Badge>
                {client.types.map((type) => (
                  <Badge key={type.id}>{type.name}</Badge>
                ))}
                {client.source && <Badge tone="blue">{client.source.name}</Badge>}
              </div>

              <div className="table-wrap">
                <table className="data">
                  <tbody>
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
                  </tbody>
                </table>
              </div>
            </Card>

            {client.requirement && (
              <Card title="Qué busca">
                <p style={{ fontSize: 'var(--t-small)', whiteSpace: 'pre-wrap' }}>
                  {client.requirement}
                </p>
              </Card>
            )}

            {client.notes && (
              <Card title="Notas heredadas de WASI">
                <p
                  style={{
                    fontSize: 'var(--t-small)',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-2)',
                  }}
                >
                  {client.notes}
                </p>
              </Card>
            )}

            <PortalAccess clientId={client.id} />

            <Card title={`Inmuebles vinculados · ${interests.length}`} flush>
              {interests.length === 0 ? (
                <Empty title="Sin inmuebles">
                  Vincula los que le has mostrado para no perder el hilo del seguimiento.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <tbody>
                      {interests.map((interest) => (
                        <tr key={interest.id}>
                          <td>
                            {interest.property ? (
                              <Link to={`/inmuebles/${interest.propertyId}`}>
                                <strong>{interest.property.code}</strong>
                                <div className="note" style={{ marginTop: 2 }}>
                                  {interest.property.title.slice(0, 46)}
                                </div>
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ width: 100 }}>
                            <Badge>{INTEREST_ROLE_LABEL[interest.role]}</Badge>
                          </td>
                          <td className="note" style={{ width: 88 }}>
                            {INTEREST_STATUS_LABEL[interest.status]}
                          </td>
                          <td className="num" style={{ width: 110 }}>
                            {interest.offeredAmount ? money(interest.offeredAmount) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="Historial" flush>
            {timeline.length === 0 ? (
              <Empty title="Sin gestiones registradas">
                Cada llamada, visita o nota que anotes queda aquí en orden.
              </Empty>
            ) : (
              <div className="card-body">
                <div className="timeline">
                  {timeline.map((entry) => (
                    <article key={`${entry.kind}-${entry.id}`} className="tl-item">
                      <span className="tl-mark" aria-hidden>
                        {entry.kind === 'appointment' ? '◷' : (ACTIVITY_MARK[entry.type] ?? '·')}
                      </span>
                      <div className="tl-body">
                        <div className="row spread" style={{ gap: 8, alignItems: 'baseline' }}>
                          <strong>{entry.summary}</strong>
                          <span className="note" style={{ whiteSpace: 'nowrap' }}>
                            {relative(entry.at)}
                          </span>
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 4 }}>
                          <Badge tone={entry.automatic ? 'neutral' : 'blue'}>
                            {entry.kind === 'appointment'
                              ? APPOINTMENT_TYPE_LABEL[entry.type]
                              : (ACTIVITY_LABEL[entry.type] ?? entry.type)}
                          </Badge>
                          <span className="note">{dateTime(entry.at)}</span>
                        </div>
                        {entry.detail && <p>{entry.detail}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td className="note" style={{ width: '42%' }}>
        {label}
      </td>
      <td className={mono ? 'figure' : undefined}>{value}</td>
    </tr>
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
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!summary.trim()}
            onClick={() => void save()}
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}
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
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!selected} onClick={() => void save()}>
            Vincular
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}

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
          <div className="card">
            <div className="card-body row spread">
              <div>
                <strong className="figure">{selected.code}</strong>
                <div className="note" style={{ marginTop: 2 }}>
                  {selected.title.slice(0, 60)}
                </div>
              </div>
              <Button size="sm" onClick={() => setSelected(null)}>
                Cambiar
              </Button>
            </div>
          </div>
        ) : (
          (results.data?.data ?? []).length > 0 && (
            <div className="card" style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table className="data">
                <tbody>
                  {results.data?.data.map((property) => (
                    <tr key={property.id} className="clickable" onClick={() => setSelected(property)}>
                      <td className="figure" style={{ width: 90 }}>
                        {property.code}
                      </td>
                      <td>{property.title.slice(0, 48)}</td>
                      <td className="num">{money(property.salePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={stageId === currentStageId}
            onClick={() => void save()}
          >
            Mover
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert">{error}</div>}
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
