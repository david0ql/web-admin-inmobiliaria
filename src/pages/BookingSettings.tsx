import { useEffect, useState } from 'react'
import { CalendarClock, Check, Clock, Loader2, Plus, X } from 'lucide-react'

import {
  Alert,
  Button,
  CacheNote,
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

type LeadMode = 'UNIFORM' | 'BY_AVAILABILITY'

interface TimeRange {
  from: string
  to: string
}

interface Workday {
  weekday: number
  /** Varios tramos por día: mañana y tarde, con la pausa en medio. */
  ranges: TimeRange[]
  open: boolean
}

interface Settings {
  workdays: Workday[]
  leadMode: LeadMode
  uniformLeadHours: number
  leadDaysByAvailability: Record<string, number>
  leadDaysByOperation: { sale: number; rent: number }
  suggestedSlots: number
  suggestedProperties: number
  slotMinutes: number
}

const DIAS = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
]

const ESTADOS = [
  { key: 'AVAILABLE', label: 'Disponible' },
  { key: 'RESERVED', label: 'Reservado' },
  { key: 'WITHDRAWN', label: 'Retirado' },
  { key: 'SOLD', label: 'Vendido' },
  { key: 'RENTED', label: 'Arrendado' },
]

/**
 * Los parámetros de la agenda.
 *
 * Antes vivían en el código —la jornada— y en una variable de entorno —la
 * antelación—, así que cambiarlos pedía un despliegue. La pantalla existe para
 * que la agencia los mueva sin llamar a nadie.
 */
export function BookingSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .get<Settings>('/settings/booking')
      .then(setSettings)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No pudimos cargar esto.'),
      )
  }, [])

  const patch = (cambio: Partial<Settings>) => {
    setSaved(false)
    setSettings((prev) => (prev ? { ...prev, ...cambio } : prev))
  }

  const patchDia = (weekday: number, cambio: Partial<Workday>) => {
    setSaved(false)
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            workdays: prev.workdays.map((d) =>
              d.weekday === weekday ? { ...d, ...cambio } : d,
            ),
          }
        : prev,
    )
  }

  async function guardar() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      /*
        Solo lo editable.

        Devolver el objeto entero incluía `id`, `createdAt`, `updatedAt` y
        `deletedAt`, y la API los rechaza: no son cosa de quien edita, son de
        la base. Mandarlos hacía que guardar fallase con cuatro mensajes
        seguidos de "should not exist".
      */
      const guardado = await api.put<Settings>('/settings/booking', {
        workdays: settings.workdays,
        leadMode: settings.leadMode,
        uniformLeadHours: settings.uniformLeadHours,
        leadDaysByAvailability: settings.leadDaysByAvailability,
        leadDaysByOperation: settings.leadDaysByOperation,
        suggestedSlots: settings.suggestedSlots,
        suggestedProperties: settings.suggestedProperties,
        slotMinutes: settings.slotMinutes,
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

  const dia = (weekday: number): Workday =>
    settings.workdays.find((d) => d.weekday === weekday) ?? {
      weekday,
      ranges: [{ from: '08:00', to: '12:00' }],
      open: false,
    }

  const patchTramo = (weekday: number, i: number, cambio: Partial<TimeRange>) =>
    patchDia(weekday, {
      ranges: dia(weekday).ranges.map((r, j) =>
        j === i ? { ...r, ...cambio } : r,
      ),
    })

  return (
    <PageBody>
      <SectionHeading light="Agenda" strong="de visitas" />
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Manda sobre lo que la web ofrece: si un horario no está aquí, no se
        puede pedir cita a esa hora ni desde el formulario ni desde el chat. Un
        día puede tener varios tramos —mañana y tarde—; lo que queda entre
        ellos no se ofrece.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" /> Horario de atención
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {DIAS.map(({ weekday, label }) => {
              const d = dia(weekday)
              return (
                <div
                  key={weekday}
                  className="flex flex-wrap items-start gap-3 border-b py-2.5 last:border-0"
                >
                  <label className="flex w-32 shrink-0 items-center gap-2 pt-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={d.open}
                      onChange={(e) =>
                        patchDia(weekday, { open: e.target.checked })
                      }
                      className="size-4"
                    />
                    {label}
                  </label>

                  {d.open ? (
                    <div className="flex flex-col gap-1.5">
                      {d.ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={r.from}
                            onChange={(e) =>
                              patchTramo(weekday, i, { from: e.target.value })
                            }
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          />
                          <span className="text-muted-foreground">a</span>
                          <input
                            type="time"
                            value={r.to}
                            onChange={(e) =>
                              patchTramo(weekday, i, { to: e.target.value })
                            }
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          />
                          {d.ranges.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Quitar tramo de ${label}`}
                              onClick={() =>
                                patchDia(weekday, {
                                  ranges: d.ranges.filter((_, j) => j !== i),
                                })
                              }
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {d.ranges.length < 4 && (
                        <button
                          type="button"
                          onClick={() =>
                            patchDia(weekday, {
                              ranges: [
                                ...d.ranges,
                                { from: '14:00', to: '18:00' },
                              ],
                            })
                          }
                          className="flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
                        >
                          <Plus className="size-3.5" /> Añadir tramo
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="pt-1.5 text-sm text-muted-foreground">
                      Cerrado
                    </span>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Con cuánta antelación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/*
                Las dos formas son excluyentes a propósito. Con los dos juegos
                de campos siempre visibles nadie sabría cuál manda; así se elige
                una y solo se ve la que aplica.
              */}
              <div className="grid gap-2 sm:grid-cols-2">
                <ModoCard
                  activo={settings.leadMode === 'UNIFORM'}
                  titulo="La misma para todo"
                  detalle="Sencillo de explicar por teléfono."
                  onClick={() => patch({ leadMode: 'UNIFORM' })}
                />
                <ModoCard
                  activo={settings.leadMode === 'BY_AVAILABILITY'}
                  titulo="Según el inmueble"
                  detalle="Un reservado necesita más margen que uno libre."
                  onClick={() => patch({ leadMode: 'BY_AVAILABILITY' })}
                />
              </div>

              {settings.leadMode === 'UNIFORM' ? (
                <Field
                  label="Horas de antelación"
                  type="number"
                  min={0}
                  max={720}
                  className="w-40"
                  value={settings.uniformLeadHours}
                  onChange={(e) =>
                    patch({ uniformLeadHours: Number(e.target.value) })
                  }
                />
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="micro-label mb-2">Por disponibilidad</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ESTADOS.map(({ key, label }) => (
                        <DiasInput
                          key={key}
                          label={label}
                          value={settings.leadDaysByAvailability?.[key] ?? 1}
                          onChange={(v) =>
                            patch({
                              leadDaysByAvailability: {
                                ...settings.leadDaysByAvailability,
                                [key]: v,
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="micro-label mb-2">Por operación</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <DiasInput
                        label="En venta"
                        value={settings.leadDaysByOperation?.sale ?? 1}
                        onChange={(v) =>
                          patch({
                            leadDaysByOperation: {
                              ...settings.leadDaysByOperation,
                              sale: v,
                            },
                          })
                        }
                      />
                      <DiasInput
                        label="En arriendo"
                        value={settings.leadDaysByOperation?.rent ?? 2}
                        onChange={(v) =>
                          patch({
                            leadDaysByOperation: {
                              ...settings.leadDaysByOperation,
                              rent: v,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <Alert>
                    Manda el más exigente de los dos. Un inmueble reservado y en
                    arriendo espera lo que pida el más largo.
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cómo propone las horas el chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Inmuebles que enseña al buscar"
                  type="number"
                  min={1}
                  max={12}
                  value={settings.suggestedProperties}
                  onChange={(e) =>
                    patch({ suggestedProperties: Number(e.target.value) })
                  }
                />
                <Field
                  label="Horarios que propone"
                  type="number"
                  min={1}
                  max={6}
                  value={settings.suggestedSlots}
                  onChange={(e) =>
                    patch({ suggestedSlots: Number(e.target.value) })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Pocas y concretas: «¿te viene mañana a las 2 o a las 3?» en
                lugar del calendario de la semana. Ocho opciones se repasan y se
                dejan para luego; dos se eligen. El mismo inmueble lo publican
                varias inmobiliarias y la visita se la lleva quien la concreta
                antes. Los horarios salen de la agenda del asesor asignado al
                inmueble.
              </p>
              <Field
                label="Duración de cada visita (minutos)"
                type="number"
                min={15}
                max={240}
                step={15}
                className="w-32"
                value={settings.slotMinutes}
                onChange={(e) => patch({ slotMinutes: Number(e.target.value) })}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <CacheNote />

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={guardar} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Guardar cambios
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="size-4" /> Guardado. Ya aplica en la web.
          </span>
        )}
      </div>
    </PageBody>
  )
}

function ModoCard({
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

function DiasInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          max={30}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-16 rounded-md border bg-background px-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">días</span>
      </span>
    </label>
  )
}
