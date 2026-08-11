import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Languages, Loader2, RotateCcw, Search } from 'lucide-react'

import {
  Button,
  CacheNote,
  Empty,
  ErrorNote,
  Loading,
  PageBody,
  SectionHeading,
} from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Entrada {
  key: string
  es: string
  en: string
  esEdited: boolean
  enEdited: boolean
}

type Idioma = 'es' | 'en'

const POR_PAGINA = 40

/**
 * Los textos de la web pública, en español y en inglés.
 *
 * Cada fila es una frase del sitio con su clave. La clave importa: es el sitio
 * exacto donde sale —`nav.projects`, `visit.form.phone`— y permite encontrar
 * una frase sin recorrer la web entera buscándola.
 *
 * Lo que se escribe aquí pisa lo que trae el código. Vaciar un campo no borra
 * la frase: devuelve la original, que es lo que se espera de un "deshacer".
 */
export function Translations() {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todas' | 'faltantes' | 'editadas'>(
    'todas',
  )
  const [pagina, setPagina] = useState(1)

  const cargar = () => {
    setEntradas(null)
    api
      .get<Entrada[]>('/i18n/entries')
      .then(setEntradas)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No pudimos cargar esto.'),
      )
  }

  useEffect(cargar, [])

  const visibles = useMemo(() => {
    if (!entradas) return []
    const texto = q.trim().toLowerCase()
    return entradas.filter((fila) => {
      if (filtro === 'faltantes' && fila.es && fila.en) return false
      if (filtro === 'editadas' && !fila.esEdited && !fila.enEdited) return false
      if (!texto) return true
      return (
        fila.key.toLowerCase().includes(texto) ||
        fila.es.toLowerCase().includes(texto) ||
        fila.en.toLowerCase().includes(texto)
      )
    })
  }, [entradas, q, filtro])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const enPagina = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  useEffect(() => {
    setPagina(1)
  }, [q, filtro])

  if (error && !entradas) return <ErrorNote>{error}</ErrorNote>

  const faltantes = entradas?.filter((f) => !f.es || !f.en).length ?? 0

  return (
    <PageBody>
      <SectionHeading light="Textos" strong="de la web" />
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Todo lo que dice la web pública, en los dos idiomas. Lo que escribas
        aquí manda sobre el texto que trae el sitio; si dejas un campo vacío,
        vuelve el original.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca por clave o por lo que dice…"
            className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm"
          />
        </div>

        <div className="flex gap-1 rounded-md border p-0.5">
          {(
            [
              ['todas', 'Todas'],
              ['faltantes', `Sin traducir${faltantes ? ` (${faltantes})` : ''}`],
              ['editadas', 'Editadas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFiltro(value)}
              aria-pressed={filtro === value}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                filtro === value
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="tabular text-xs text-muted-foreground">
          {visibles.length} de {entradas?.length ?? 0}
        </span>
      </div>

      {!entradas ? (
        <Loading />
      ) : visibles.length === 0 ? (
        <Empty title="Nada por aquí">
          Ninguna frase encaja con lo que buscas.
        </Empty>
      ) : (
        <>
          {/* Los dos idiomas uno al lado del otro: traducir es comparar, y con
              una columna por idioma se ve al instante qué falta. */}
          <div className="hidden gap-4 px-3 pb-2 text-xs tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
            <span>Clave</span>
            <span className="flex items-center gap-1.5">
              <Languages className="size-3.5" /> Español
            </span>
            <span className="flex items-center gap-1.5">
              <Languages className="size-3.5" /> English
            </span>
          </div>

          <ul className="space-y-2">
            {enPagina.map((fila) => (
              <Fila
                key={fila.key}
                fila={fila}
                onGuardada={(idioma, value) =>
                  setEntradas((previas) =>
                    (previas ?? []).map((f) =>
                      f.key === fila.key
                        ? {
                            ...f,
                            [idioma]: value.texto,
                            [`${idioma}Edited`]: value.editada,
                          }
                        : f,
                    ),
                  )
                }
              />
            ))}
          </ul>

          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pagina === 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="tabular text-xs text-muted-foreground">
                {pagina} de {paginas}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pagina === paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </>
      )}

      <CacheNote />
    </PageBody>
  )
}

function Fila({
  fila,
  onGuardada,
}: {
  fila: Entrada
  onGuardada: (
    idioma: Idioma,
    value: { texto: string; editada: boolean },
  ) => void
}) {
  return (
    <li className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] lg:items-start lg:gap-4">
      <code className="block truncate text-xs text-muted-foreground" title={fila.key}>
        {fila.key}
      </code>
      <Campo fila={fila} idioma="es" onGuardada={onGuardada} />
      <Campo fila={fila} idioma="en" onGuardada={onGuardada} />
    </li>
  )
}

/**
 * Un texto, con su guardado.
 *
 * Se guarda al salir del campo y no con un botón por fila: son cientos de
 * frases y pulsar "guardar" cuatrocientas veces no es trabajo de nadie. El
 * aviso de guardado se queda un momento para que se vea que pasó algo.
 */
function Campo({
  fila,
  idioma,
  onGuardada,
}: {
  fila: Entrada
  idioma: Idioma
  onGuardada: (
    idioma: Idioma,
    value: { texto: string; editada: boolean },
  ) => void
}) {
  const original = fila[idioma]
  const [texto, setTexto] = useState(original)
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>(
    'quieto',
  )
  const ultimo = useRef(original)

  useEffect(() => {
    setTexto(original)
    ultimo.current = original
  }, [original])

  const guardar = async (valor: string) => {
    if (valor === ultimo.current) return
    setEstado('guardando')
    try {
      await api.put(`/i18n/${idioma}/${encodeURIComponent(fila.key)}`, {
        value: valor,
      })
      ultimo.current = valor
      onGuardada(idioma, { texto: valor, editada: valor.trim().length > 0 })
      setEstado('guardado')
      setTimeout(() => setEstado('quieto'), 1500)
    } catch {
      setEstado('quieto')
    }
  }

  const editada = idioma === 'es' ? fila.esEdited : fila.enEdited

  return (
    <div className="min-w-0">
      <div className="relative">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={(e) => void guardar(e.target.value)}
          rows={Math.min(4, Math.max(1, Math.ceil(texto.length / 48)))}
          placeholder={idioma === 'es' ? 'Sin texto' : 'Sin traducir'}
          className={cn(
            'w-full resize-y rounded-md border bg-background px-3 py-2 text-sm',
            !texto && 'border-dashed',
          )}
        />
        {estado !== 'quieto' && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-background/90 px-1.5 text-[11px] text-muted-foreground">
            {estado === 'guardando' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
          </span>
        )}
      </div>

      {editada && (
        <button
          type="button"
          onClick={() => {
            setTexto('')
            void guardar('')
          }}
          className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3" />
          Volver al texto original
        </button>
      )}
    </div>
  )
}
