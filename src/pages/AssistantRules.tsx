import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorNote,
  Loading,
  PageBody,
  SectionHeading,
  Textarea,
} from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Rule {
  id: string
  text: string
  active: boolean
  source: 'MANUAL' | 'REVIEW'
  createdAt: string
}

/**
 * Lo que la agencia le añade al asistente.
 *
 * Dos cosas distintas y por eso separadas: las reglas —cada una nació de una
 * respuesta que no gustó, son cortas y se activan o se apagan una a una— y el
 * texto libre, que es la voz de la agencia y va al final de todo.
 */
export function AssistantRules() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [postPrompt, setPostPrompt] = useState('')
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [savedPrompt, setSavedPrompt] = useState(false)

  useEffect(() => {
    void Promise.all([
      api.get<Rule[]>('/assistant/rules'),
      api.get<{ postPrompt: string }>('/assistant/settings'),
    ])
      .then(([r, s]) => {
        setRules(r)
        setPostPrompt(s.postPrompt ?? '')
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No pudimos cargar esto.'),
      )
  }, [])

  const recargar = () =>
    api.get<Rule[]>('/assistant/rules').then(setRules).catch(() => undefined)

  async function crear() {
    const text = nueva.trim()
    if (text.length < 5) return
    await api.post('/assistant/rules', { text })
    setNueva('')
    void recargar()
  }

  async function alternar(rule: Rule) {
    await api.patch(`/assistant/rules/${rule.id}`, { active: !rule.active })
    void recargar()
  }

  async function borrar(rule: Rule) {
    await api.delete(`/assistant/rules/${rule.id}`)
    void recargar()
  }

  async function guardarPrompt() {
    setSavingPrompt(true)
    setError(null)
    try {
      await api.put('/assistant/settings', { postPrompt })
      setSavedPrompt(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar.')
    } finally {
      setSavingPrompt(false)
    }
  }

  if (error && !rules) return <ErrorNote>{error}</ErrorNote>
  if (!rules) return <Loading />

  const activas = rules.filter((r) => r.active).length

  return (
    <PageBody>
      <SectionHeading light="Cómo responde" strong="el asistente" />
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Todo esto se le añade a lo que ya sabe hacer. Se aplica en la siguiente
        respuesta, sin desplegar nada.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Reglas</span>
              <span className="text-xs font-normal text-muted-foreground">
                {activas} activas de {rules.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <input
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void crear()}
                placeholder="Ej.: No repitas el nombre del cliente en cada frase."
                maxLength={240}
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              />
              <Button
                size="sm"
                onClick={() => void crear()}
                disabled={nueva.trim().length < 5}
              >
                <Plus className="size-4" /> Añadir
              </Button>
            </div>

            {rules.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay reglas. Salen solas al calificar una conversación,
                o se escriben aquí.
              </p>
            )}

            <ul className="space-y-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={cn(
                    'flex items-start gap-2 rounded-md border p-2.5',
                    !rule.active && 'opacity-55',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={rule.active}
                    onChange={() => void alternar(rule)}
                    aria-label={rule.active ? 'Desactivar regla' : 'Activar regla'}
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{rule.text}</p>
                    {rule.source === 'REVIEW' && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Sparkles className="size-3" /> Salió de una calificación
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void borrar(rule)}
                    aria-label="Eliminar regla"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>

            {activas > 30 && (
              <Alert>
                Con muchas reglas el modelo empieza a olvidarse de las del medio.
                Apaga las que ya no apliquen antes de añadir más.
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instrucciones de la agencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Texto libre, en tus palabras. Va al final de todo —después de lo
              nuestro y de las reglas—, que es lo que más le pesa al modelo: aquí
              puedes pasar por encima de lo demás.
            </p>
            <Textarea
              value={postPrompt}
              onChange={(e) => {
                setPostPrompt(e.target.value)
                setSavedPrompt(false)
              }}
              rows={14}
              maxLength={4000}
              placeholder={
                'Ej.: Cuando pregunten por financiación, menciona que trabajamos con Bancolombia y Davivienda y ofrece la simulación de crédito.'
              }
            />
            <div className="flex items-center gap-3">
              <Button onClick={() => void guardarPrompt()} disabled={savingPrompt}>
                {savingPrompt && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
              <span className="text-xs text-muted-foreground">
                {savedPrompt ? (
                  <span className="flex items-center gap-1">
                    <Check className="size-3.5" /> Guardado
                  </span>
                ) : (
                  `${postPrompt.length} / 4000`
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </PageBody>
  )
}
