import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, X } from 'lucide-react'

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorNote,
  Field,
  Loading,
  PageBody,
  SectionHeading,
} from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Source = 'RECENT' | 'OUTSTANDING' | 'MANUAL'
type Effect = 'SLIDE' | 'FADE'

interface Settings {
  enabled: boolean
  source: Source
  codes: string[]
  count: number
  autoplay: boolean
  delayMs: number
  effect: Effect
}

const FUENTES: { value: Source; titulo: string; detalle: string }[] = [
  {
    value: 'RECENT',
    titulo: 'Los últimos publicados',
    detalle: 'Se actualiza solo. Lo que sube hoy sale hoy.',
  },
  {
    value: 'OUTSTANDING',
    titulo: 'Los destacados',
    detalle: 'Los que marcaste como destacados en el inventario.',
  },
  {
    value: 'MANUAL',
    titulo: 'Los que yo elija',
    detalle: 'Por código y en tu orden. Manda tú.',
  },
]

/**
 * El escaparate de la portada.
 *
 * Qué inmuebles salen, cuántos, si pasan solos y cómo. Estaba escrito en el
 * código —los nueve últimos, quietos— y es justo lo que una agencia quiere
 * mover: la semana que tiene tres casas buenas quiere enseñar esas, no las
 * últimas que subió.
 */
export function HomeShowcase() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .get<Settings>('/settings/home')
      .then(setSettings)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No pudimos cargar esto.'),
      )
  }, [])

  const patch = (cambio: Partial<Settings>) => {
    setSaved(false)
    setSettings((prev) => (prev ? { ...prev, ...cambio } : prev))
  }

  async function guardar() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const guardado = await api.put<Settings>('/settings/home', {
        enabled: settings.enabled,
        source: settings.source,
        codes: settings.codes,
        count: settings.count,
        autoplay: settings.autoplay,
        delayMs: settings.delayMs,
        effect: settings.effect,
      })
      setSettings(guardado)
      setSaved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !settings) return <ErrorNote>{error}</ErrorNote>
  if (!settings) return <Loading />

  const añadirCodigo = () => {
    const code = codigo.trim()
    if (!code || settings.codes.includes(code)) return
    patch({ codes: [...settings.codes, code].slice(0, 24) })
    setCodigo('')
  }

  return (
    <PageBody>
      <SectionHeading light="Portada" strong="del sitio" />
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        El carrusel de inmuebles que ve cualquiera que entre en la web.
      </p>

      {/* El interruptor va arriba y aparte: es lo primero que se decide, y lo
          de abajo solo tiene sentido si esta encendido. */}
      <label
        className={cn(
          'mb-6 flex items-start gap-3 rounded-lg border p-4 transition-colors',
          settings.enabled ? 'border-primary bg-primary/5' : 'bg-secondary/40',
        )}
      >
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="mt-0.5 size-4"
        />
        <span>
          <span className="block text-sm font-medium">
            {settings.enabled
              ? 'El carrusel se está enseñando'
              : 'El carrusel está apagado'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {settings.enabled
              ? 'Aparece en la portada, debajo de los proyectos.'
              : 'La sección entera desaparece de la portada. Lo de abajo se guarda: al encenderlo vuelve como lo dejaste.'}
          </span>
        </span>
      </label>

      <div
        className={cn(
          'grid gap-6 lg:grid-cols-2',
          !settings.enabled && 'pointer-events-none opacity-50',
        )}
        aria-hidden={!settings.enabled}
      >
        <Card>
          <CardHeader>
            <CardTitle>Qué inmuebles salen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {FUENTES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => patch({ source: f.value })}
                  aria-pressed={settings.source === f.value}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    settings.source === f.value
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-secondary',
                  )}
                >
                  <p className="text-sm font-medium">{f.titulo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {f.detalle}
                  </p>
                </button>
              ))}
            </div>

            {settings.source === 'MANUAL' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && añadirCodigo()}
                    placeholder="Código del inmueble, ej. 9650807"
                    className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                  />
                  <Button size="sm" onClick={añadirCodigo} disabled={!codigo.trim()}>
                    <Plus className="size-4" /> Añadir
                  </Button>
                </div>

                {settings.codes.length === 0 ? (
                  <Alert>
                    Sin códigos no hay nada que enseñar: añade al menos tres.
                  </Alert>
                ) : (
                  <ul className="space-y-1.5">
                    {settings.codes.map((code, i) => (
                      <li
                        key={code}
                        className="flex items-center gap-2 rounded-md border px-3 py-2"
                      >
                        <span className="tabular w-6 shrink-0 text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="tabular flex-1 text-sm">{code}</span>
                        <button
                          type="button"
                          aria-label={`Quitar ${code}`}
                          onClick={() =>
                            patch({
                              codes: settings.codes.filter((c) => c !== code),
                            })
                          }
                          className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Salen en este orden. Si uno deja de estar publicado, se salta
                  solo.
                </p>
              </div>
            ) : (
              <Field
                label="Cuántos inmuebles"
                type="number"
                min={3}
                max={24}
                className="w-32"
                value={settings.count}
                onChange={(e) => patch({ count: Number(e.target.value) })}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cómo se mueve</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-2.5 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={settings.autoplay}
                onChange={(e) => patch({ autoplay: e.target.checked })}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block text-sm font-medium">Pasa solo</span>
                <span className="block text-xs text-muted-foreground">
                  Se detiene mientras alguien tiene el ratón encima: no le
                  quitamos la tarjeta de debajo del cursor.
                </span>
              </span>
            </label>

            {settings.autoplay && (
              <div>
                <Field
                  label="Cada cuánto pasa (segundos)"
                  type="number"
                  min={2}
                  max={15}
                  className="w-32"
                  value={Math.round(settings.delayMs / 1000)}
                  onChange={(e) =>
                    patch({ delayMs: Number(e.target.value) * 1000 })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Menos de dos no da tiempo a leer la tarjeta; más de quince no
                  se nota que se mueve.
                </p>
              </div>
            )}

            <div>
              <p className="micro-label mb-2">Estilo del movimiento</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Estilo
                  activo={settings.effect === 'SLIDE'}
                  titulo="Deslizar"
                  detalle="Se corren de lado. Es lo que se espera."
                  onClick={() => patch({ effect: 'SLIDE' })}
                />
                <Estilo
                  activo={settings.effect === 'FADE'}
                  titulo="Fundido"
                  detalle="Se funden. Más tranquilo, de uno en uno."
                  onClick={() => patch({ effect: 'FADE' })}
                />
              </div>
              {settings.effect === 'FADE' && (
                <Alert>
                  En fundido las tarjetas se apilan, así que se ve una cada vez
                  en lugar de tres.
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => void guardar()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Guardar cambios
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="size-4" /> Guardado. Se ve en la web en un minuto.
          </span>
        )}
      </div>
    </PageBody>
  )
}

function Estilo({
  activo,
  titulo,
  detalle,
  onClick,
}: {
  activo: boolean
  titulo: string
  detalle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'rounded-lg border p-3 text-left transition-colors',
        activo ? 'border-primary bg-primary/5' : 'hover:bg-secondary',
      )}
    >
      <p className="text-sm font-medium">{titulo}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>
    </button>
  )
}
