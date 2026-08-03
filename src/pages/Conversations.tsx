import { useEffect, useState } from 'react'
import { Check, Loader2, MessageSquare, Search, Sparkles } from 'lucide-react'

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

interface Row {
  id: string
  propertyCode: string | null
  lastMessageAt: string
  messageCount: number
  reviews: number
  client: { id: string; firstName: string; lastName: string | null; email: string | null; cellPhone: string | null }
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface Review {
  id: string
  issues: string[]
  comment: string
  suggestedRule: string | null
  appliedRuleId: string | null
  createdAt: string
  reviewedBy?: { firstName: string } | null
}

interface Detail extends Omit<Row, 'reviews'> {
  messages: Message[]
  reviews: Review[]
}

interface Issue {
  value: string
  label: string
}

/**
 * El histórico del chat.
 *
 * Existe para una cosa: leer lo que contestó el asistente y decir qué falló.
 * De ahí sale la regla que lo corrige, así que la pantalla está montada para
 * llegar rápido a una conversación concreta —de ahí los filtros— y para que
 * calificar sea cuestión de dos clics y una frase.
 */
export function Conversations() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [reviewed, setReviewed] = useState<'' | 'yes' | 'no'>('')
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = () => {
    setRows(null)
    api
      .get<{ data: Row[]; meta: { total: number } }>('/assistant/conversations', {
        q: q || undefined,
        reviewed: reviewed || undefined,
        page,
        limit: 20,
      })
      .then((res) => {
        setRows(res.data)
        setTotal(res.meta.total)
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No pudimos cargar esto.'),
      )
  }

  useEffect(cargar, [page, reviewed])

  if (error && !rows) return <ErrorNote>{error}</ErrorNote>

  return (
    <PageBody>
      <SectionHeading light="Conversaciones" strong="del chat" />
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        Lo que la gente le pregunta al asistente y lo que contestó. Al calificar
        una respuesta, el asistente propone cómo corregirse.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            cargar()
          }}
          className="flex min-w-0 flex-1 gap-2"
        >
          {/* Una sola caja: quien busca no se para a pensar si lo que recuerda
              es el nombre, el correo o el teléfono. */}
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, correo o teléfono…"
              className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Buscar
          </Button>
        </form>

        <div className="flex gap-1 rounded-md border p-0.5">
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

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title="Nada por aquí">
          Todavía no hay conversaciones que encajen con el filtro.
        </Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setAbierta(row.id)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary"
            >
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.client.firstName} {row.client.lastName ?? ''}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[row.client.cellPhone, row.client.email]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {row.propertyCode && (
                <Badge tone="neutral">{row.propertyCode}</Badge>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.messageCount} mensajes
              </span>
              {row.reviews > 0 && (
                <Badge>{row.reviews} calificada{row.reviews > 1 ? 's' : ''}</Badge>
              )}
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                {new Date(row.lastMessageAt).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
          ))}
          <Pager
            page={page}
            pages={Math.max(1, Math.ceil(total / 20))}
            total={total}
            unit="conversaciones"
            onPage={setPage}
          />
        </div>
      )}

      {abierta && (
        <ConversationDetail
          id={abierta}
          onClose={() => {
            setAbierta(null)
            cargar()
          }}
        />
      )}
    </PageBody>
  )
}

function ConversationDetail({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [calificando, setCalificando] = useState(false)

  const cargar = () =>
    api.get<Detail>(`/assistant/conversations/${id}`).then(setDetail)

  useEffect(() => {
    void cargar()
  }, [id])

  return (
    <Modal onClose={onClose} title="Conversación" wide>
      {!detail ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="text-sm">
            <p className="font-medium">
              {detail.client.firstName} {detail.client.lastName ?? ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {[detail.client.cellPhone, detail.client.email]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-lg border bg-secondary/30 p-3">
            {detail.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-card border',
                )}
              >
                {m.content}
              </div>
            ))}
          </div>

          {detail.reviews.map((review) => (
            <ReviewCard key={review.id} review={review} onApplied={cargar} />
          ))}

          {calificando ? (
            <ReviewForm
              conversationId={id}
              onDone={() => {
                setCalificando(false)
                void cargar()
              }}
              onCancel={() => setCalificando(false)}
            />
          ) : (
            <Button onClick={() => setCalificando(true)}>
              Calificar esta conversación
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
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
