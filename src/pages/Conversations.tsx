import { useEffect, useState } from 'react'
import {
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Sparkles,
  X,
} from 'lucide-react'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  ErrorNote,
  Loading,
  Modal,
  PageBody,
  Pager,
  SectionHeading,
  Textarea,
} from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Client {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  cellPhone: string | null
}

interface Row {
  client: Client
  conversations: number
  messages: number
  reviews: number
  lastMessageAt: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface Conversation {
  id: string
  propertyCode: string | null
  createdAt: string
  lastMessageAt: string
  messages: Message[]
}

interface Review {
  id: string
  conversationId: string
  issues: string[]
  comment: string
  suggestedRule: string | null
  appliedRuleId: string | null
  createdAt: string
  reviewedBy?: { firstName: string } | null
}

interface Thread {
  client: Client
  conversations: Conversation[]
  reviews: Review[]
}

interface Issue {
  value: string
  label: string
}

const LIMITE = 20

/**
 * El histórico del chat, por persona.
 *
 * Una fila por cliente y no por conversación: quien vuelve tres veces generaba
 * tres filas idénticas y había que abrir las tres para entender una sola
 * historia. Aquí se abre una vez y se lee todo seguido, con una línea que marca
 * dónde terminó una visita y empezó la siguiente.
 *
 * Sigue existiendo para lo mismo: leer lo que contestó el asistente y decir qué
 * falló, porque de ahí sale la regla que lo corrige.
 */
export function Conversations() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filtros, setFiltros] = useState({ name: '', email: '', phone: '' })
  const [aplicados, setAplicados] = useState(filtros)
  const [reviewed, setReviewed] = useState<'' | 'yes' | 'no'>('')
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<Client | null>(null)

  useEffect(() => {
    let vigente = true
    setRows(null)
    api
      .get<{ data: Row[]; meta: { total: number } }>(
        '/assistant/conversations',
        {
          name: aplicados.name || undefined,
          email: aplicados.email || undefined,
          phone: aplicados.phone || undefined,
          reviewed: reviewed || undefined,
          page,
          limit: LIMITE,
        },
      )
      .then((res) => {
        // Si mientras tanto se cambió de página, esta respuesta ya no vale.
        if (!vigente) return
        setRows(res.data)
        setTotal(res.meta.total)
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof Error ? e.message : 'No pudimos cargar esto.')
      })
    return () => {
      vigente = false
    }
  }, [page, reviewed, aplicados])

  const buscar = () => {
    setPage(1)
    setAplicados(filtros)
  }

  const limpiar = () => {
    const vacio = { name: '', email: '', phone: '' }
    setFiltros(vacio)
    setAplicados(vacio)
    setPage(1)
  }

  const hayFiltro = Object.values(aplicados).some(Boolean)

  if (error && !rows) return <ErrorNote>{error}</ErrorNote>

  return (
    <PageBody>
      <SectionHeading light="Conversaciones" strong="del chat" />
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        Lo que la gente le pregunta al asistente y lo que contestó, agrupado por
        persona. Al calificar una respuesta, el asistente propone cómo
        corregirse.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          buscar()
        }}
        className="mb-4 space-y-3 rounded-lg border p-3"
      >
        {/* Tres campos separados y no una caja única: quien revisa suele venir
            del CRM con el dato exacto delante —el teléfono de una ficha, el
            correo de un correo— y buscar por ese campo evita los falsos
            positivos de mezclarlos todos. */}
        <div className="grid gap-2 sm:grid-cols-3">
          <Filtro
            icon={Search}
            placeholder="Nombre o apellidos"
            value={filtros.name}
            onChange={(name) => setFiltros((f) => ({ ...f, name }))}
          />
          <Filtro
            icon={Mail}
            type="email"
            placeholder="Correo"
            value={filtros.email}
            onChange={(email) => setFiltros((f) => ({ ...f, email }))}
          />
          <Filtro
            icon={Phone}
            type="tel"
            placeholder="Teléfono"
            value={filtros.phone}
            onChange={(phone) => setFiltros((f) => ({ ...f, phone }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">
            Buscar
          </Button>
          {hayFiltro && (
            <Button type="button" size="sm" variant="ghost" onClick={limpiar}>
              <X className="size-4" /> Quitar filtros
            </Button>
          )}

          <div className="ml-auto flex gap-1 rounded-md border p-0.5">
            {(
              [
                ['', 'Todas'],
                ['no', 'Sin calificar'],
                ['yes', 'Calificadas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setReviewed(value)
                  setPage(1)
                }}
                aria-pressed={reviewed === value}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  reviewed === value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </form>

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title="Nada por aquí">
          {hayFiltro
            ? 'Ninguna persona encaja con lo que buscas.'
            : 'Todavía nadie ha escrito al asistente.'}
        </Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <button
              key={row.client.id}
              type="button"
              onClick={() => setAbierto(row.client)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary"
            >
              <Avatar client={row.client} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {nombre(row.client)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[row.client.cellPhone, row.client.email]
                    .filter(Boolean)
                    .join(' · ') || 'Sin datos de contacto'}
                </p>
              </div>

              <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                <MessageSquare className="size-3.5" />
                {row.conversations === 1
                  ? '1 conversación'
                  : `${row.conversations} conversaciones`}
              </span>
              <span className="tabular hidden shrink-0 text-xs text-muted-foreground md:block">
                {row.messages} mensajes
              </span>
              {row.reviews > 0 && (
                <Badge>
                  {row.reviews} calificada{row.reviews > 1 ? 's' : ''}
                </Badge>
              )}
              <span className="hidden shrink-0 text-xs text-muted-foreground lg:block">
                {fecha(row.lastMessageAt)}
              </span>
            </button>
          ))}
          <Pager
            page={page}
            pages={Math.max(1, Math.ceil(total / LIMITE))}
            total={total}
            unit="personas"
            onPage={setPage}
          />
        </div>
      )}

      {abierto && (
        <ClientThread
          client={abierto}
          onClose={() => {
            setAbierto(null)
            // Al cerrar puede haber una calificación nueva: se recarga la
            // página actual para que el contador de la fila cuadre.
            setAplicados((f) => ({ ...f }))
          }}
        />
      )}
    </PageBody>
  )
}

function Filtro({
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  icon: typeof Search
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div className="relative">
      <Icon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm"
      />
    </div>
  )
}

/**
 * Todo lo que ha hablado una persona, seguido.
 *
 * Las conversaciones van una detrás de otra separadas por una línea con su
 * fecha: se lee como un hilo de mensajería, que es como la gente entiende una
 * conversación, sin perder de vista que hubo varias visitas distintas.
 */
function ClientThread({
  client,
  onClose,
}: {
  client: Client
  onClose: () => void
}) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [calificando, setCalificando] = useState<string | null>(null)

  const cargar = () =>
    api.get<Thread>(`/assistant/clients/${client.id}/thread`).then(setThread)

  useEffect(() => {
    void cargar()
  }, [client.id])

  const mensajes =
    thread?.conversations.reduce((n, c) => n + c.messages.length, 0) ?? 0

  return (
    <Modal onClose={onClose} title={nombre(client)} wide>
      {!thread ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {/* La cabecera es lo primero que se mira: quién es y cómo se le
              contesta. Los datos de contacto son enlaces porque lo siguiente
              que hace quien revisa es llamar o escribir. */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-secondary/30 p-3">
            <Avatar client={client} size="lg" />
            <div className="min-w-0 flex-1">
              {/* Sin repetir el nombre: ya está en el título del modal, dos
                  líneas más arriba. */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {client.cellPhone && (
                  <a
                    href={`tel:${client.cellPhone}`}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <Phone className="size-3.5" /> {client.cellPhone}
                  </a>
                )}
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="flex items-center gap-1 truncate hover:text-foreground"
                  >
                    <Mail className="size-3.5" /> {client.email}
                  </a>
                )}
              </div>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {thread.conversations.length === 1
                ? '1 conversación'
                : `${thread.conversations.length} conversaciones`}
              <br />
              {mensajes} mensajes
            </p>
          </div>

          <div className="max-h-[52vh] space-y-3 overflow-y-auto rounded-lg border bg-secondary/20 p-3">
            {thread.conversations.map((conversation, i) => (
              <section key={conversation.id} className="space-y-2">
                {/* La línea separadora: sin ella los mensajes de una visita de
                    hace un mes parecen la continuación de los de ayer. */}
                <div
                  className={cn(
                    'flex items-center gap-2',
                    i > 0 && 'pt-3',
                  )}
                >
                  <span className="h-px flex-1 bg-border" />
                  <span className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    {fecha(conversation.createdAt)}
                    {conversation.propertyCode && (
                      <span className="tabular font-medium text-foreground">
                        · {conversation.propertyCode}
                      </span>
                    )}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                {conversation.messages.map((m, j) => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex flex-col gap-0.5',
                      m.role === 'user' ? 'items-end' : 'items-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                        m.role === 'user'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm border bg-card',
                      )}
                    >
                      {m.content}
                    </div>
                    {/* La hora solo cuando aporta: bajo cada burbuja son
                        veintiocho marcas de tiempo que nadie lee y que tapan lo
                        que sí importa, que es el texto. Se enseña al empezar y
                        cuando hubo una pausa de verdad. */}
                    {huboPausa(conversation.messages, j) && (
                      <span className="px-1 text-[10px] text-muted-foreground">
                        {hora(m.createdAt)}
                      </span>
                    )}
                  </div>
                ))}

                {thread.reviews
                  .filter((r) => r.conversationId === conversation.id)
                  .map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      onApplied={cargar}
                    />
                  ))}

                {calificando === conversation.id ? (
                  <ReviewForm
                    conversationId={conversation.id}
                    onDone={() => {
                      setCalificando(null)
                      void cargar()
                    }}
                    onCancel={() => setCalificando(null)}
                  />
                ) : (
                  <div className="flex justify-center pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCalificando(conversation.id)}
                    >
                      Calificar esta conversación
                    </Button>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** ¿Merece la pena poner la hora en este mensaje? */
function huboPausa(messages: Message[], i: number): boolean {
  if (i === 0) return true
  const anterior = new Date(messages[i - 1].createdAt).getTime()
  const actual = new Date(messages[i].createdAt).getTime()
  return actual - anterior > 5 * 60 * 1000
}

function Avatar({
  client,
  size = 'md',
}: {
  client: Client
  size?: 'md' | 'lg'
}) {
  const iniciales = `${client.firstName?.[0] ?? ''}${client.lastName?.[0] ?? ''}`
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary',
        size === 'lg' ? 'size-11 text-base' : 'size-9 text-xs',
      )}
    >
      {iniciales.toUpperCase() || '?'}
    </span>
  )
}

function nombre(client: Client): string {
  return `${client.firstName} ${client.lastName ?? ''}`.trim()
}

/*
  Todo se pinta en hora de Colombia y no en la del navegador.

  Quien revisa puede estar en otro huso —o tener el portátil mal puesto— y una
  conversación de las 8 de la mañana leída como las 6 no cuadra con nada: ni con
  la agenda, ni con lo que dice el propio chat. La agencia trabaja en GMT-5, así
  que la pantalla habla en GMT-5.
*/
const COLOMBIA = 'America/Bogota'

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: COLOMBIA,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: COLOMBIA,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ReviewCard({
  review,
  onApplied,
}: {
  review: Review
  onApplied: () => Promise<unknown>
}) {
  const [text, setText] = useState(review.suggestedRule ?? '')
  const [aplicando, setAplicando] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Calificada por {review.reviewedBy?.firstName ?? 'alguien del equipo'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{review.comment}</p>

        {review.appliedRuleId ? (
          <Alert>
            <span className="flex items-center gap-1.5">
              <Check className="size-4" /> Ya es una regla activa.
            </span>
          </Alert>
        ) : review.suggestedRule ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" /> El asistente propone corregirse
              así. Puedes ajustarlo antes de aplicarlo.
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={240}
            />
            <Button
              size="sm"
              disabled={aplicando || text.trim().length < 5}
              onClick={() => {
                setAplicando(true)
                void api
                  .post(`/assistant/reviews/${review.id}/apply`, { text })
                  .then(onApplied)
                  .finally(() => setAplicando(false))
              }}
            >
              {aplicando && <Loader2 className="size-4 animate-spin" />}
              Aplicar como regla
            </Button>
          </div>
        ) : (
          <Alert>
            No se pudo redactar una propuesta. La calificación queda guardada.
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewForm({
  conversationId,
  onDone,
  onCancel,
}: {
  conversationId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [marcados, setMarcados] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.get<Issue[]>('/assistant/issues').then(setIssues)
  }, [])

  const listo = marcados.length > 0 && comment.trim().length >= 10

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">¿Qué falló?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {issues.map((issue) => {
            const activo = marcados.includes(issue.value)
            return (
              <button
                key={issue.value}
                type="button"
                aria-pressed={activo}
                onClick={() =>
                  setMarcados((prev) =>
                    activo
                      ? prev.filter((v) => v !== issue.value)
                      : [...prev, issue.value],
                  )
                }
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  activo
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-secondary',
                )}
              >
                {issue.label}
              </button>
            )
          })}
        </div>

        <div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="¿Qué habría estado bien? Esto es lo que el asistente usa para corregirse."
          />
          {/* Obligatorio a propósito: marcar "tono robótico" y nada más no
              sirve para corregir nada. */}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Obligatorio, mínimo 10 caracteres.
          </p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!listo || enviando}
            onClick={() => {
              setEnviando(true)
              setError(null)
              api
                .post(`/assistant/conversations/${conversationId}/reviews`, {
                  issues: marcados,
                  comment,
                })
                .then(onDone)
                .catch((e: unknown) =>
                  setError(
                    e instanceof Error ? e.message : 'No pudimos guardarlo.',
                  ),
                )
                .finally(() => setEnviando(false))
            }}
          >
            {enviando && <Loader2 className="size-4 animate-spin" />}
            Guardar y proponer corrección
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
