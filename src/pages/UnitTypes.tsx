import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Ruler } from 'lucide-react';
import {
  ApiError,
  api,
  type MediaImage,
  type UnitType,
  type UnitTypeSummary,
} from '../lib/api';
import { useFetch } from '../lib/useFetch';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Modal,
  SelectField,
  Table,
  TBody,
  Td,
  Th,
  THead,
  TextareaField,
  Tr,
} from '../components/ui';
import { area, moneyShort, number } from '../lib/format';
import { Gallery } from '../components/media/Gallery';

/**
 * Las tipologias de un proyecto: la tabla fija de «Tipo A, Tipo B, Tipo C» a la
 * que pertenece cada inmueble.
 *
 * Vive en su propio fichero y no dentro de ProjectDetail porque el selector de
 * abajo lo necesitan tambien la ficha del inmueble y su formulario, y los tres
 * tienen que ofrecer exactamente lo mismo: las tipologias del proyecto al que
 * pertenece el inmueble y ninguna otra.
 */

/** Lo que explica de una vez por que hay filas que no se pueden tocar. */
const AUTO_NOTA =
  'Las marcadas como automáticas las pone el sistema agrupando por tramo de área, ' +
  'y por eso no se editan a mano: son de suelo —lotes, terrenos y fincas—, donde ' +
  'no hay dos iguales y escribirlas a mano sería una tipología por inmueble. ' +
  'Se crean, se recolocan y se borran solas según el área de los inmuebles: si ' +
  'quieres mandar tú sobre uno, asígnale desde su ficha una tipología escrita a ' +
  'mano y ésa ya no se mueve.';

export function UnitTypesCard({
  familyId,
  summaries,
  editable,
  onChange,
}: {
  familyId: string;
  summaries: UnitTypeSummary[];
  editable: boolean;
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UnitTypeSummary | null>(null);
  const [imagenesDe, setImagenesDe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  // La fila de «Sin clasificar» llega sin id: es el recuento de lo que falta por
  // clasificar, no una tipologia, y no se ordena ni se borra.
  const reales = summaries.filter((unit) => unit.id !== null);
  const hayAuto = reales.some((unit) => unit.kind === 'AUTO');
  // El plano es lo que el comprador abre para decidir, asi que cuantas lo
  // tienen es lo primero que hay que poder leer de esta pantalla.
  const conPlano = reales.filter((unit) => planos(unit).length > 0).length;
  const abierta = imagenesDe
    ? (summaries.find((unit) => unit.id === imagenesDe) ?? null)
    : null;

  /*
    Reordenar manda SIEMPRE la lista entera y no solo la fila movida: la API
    reparte posiciones por el indice del array, asi que un envio parcial dejaria
    a las que faltan con la posicion vieja y el orden saldria mezclado.
  */
  async function mover(index: number, salto: -1 | 1) {
    const destino = index + salto;
    if (destino < 0 || destino >= reales.length) return;
    const orden = reales.map((unit) => unit.id as string);
    [orden[index], orden[destino]] = [orden[destino], orden[index]];

    setMoving(true);
    setError(null);
    try {
      await api.put(`/families/${familyId}/unit-types/order`, {
        unitTypeIds: orden,
      });
      onChange();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar el orden.',
      );
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <Card
        title="Tipologías"
        action={
          editable ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nueva
            </Button>
          ) : (
            <span className="note">Lo que ve el comprador al abrir el proyecto</span>
          )
        }
        flush
      >
        {error && (
          <div className="px-5 pt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {summaries.length === 0 ? (
          <div className="p-5">
            <Empty
              title="Sin tipologías"
              action={
                editable && (
                  <Button onClick={() => setCreating(true)}>Crear la primera</Button>
                )
              }
            >
              Escribe aquí los tipos de unidad del proyecto —Tipo A, Tipo B— y luego
              asigna cada inmueble al suyo. Hasta que existan, las unidades salen sin
              clasificar.
            </Empty>
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Código</Th>
                <Th>Tipología</Th>
                <Th num hideSm>
                  Alcobas
                </Th>
                <Th num hideSm>
                  Baños
                </Th>
                <Th num>Área</Th>
                <Th num>Desde</Th>
                <Th num>Unidades</Th>
                {editable && <Th />}
              </tr>
            </THead>
            <TBody>
              {summaries.map((unit) => {
                const index = unit.id ? reales.findIndex((r) => r.id === unit.id) : -1;
                const auto = unit.kind === 'AUTO';
                return (
                  <Tr key={unit.id ?? 'sin-clasificar'}>
                    <Td className="tabular w-[80px]">
                      {unit.code ?? <span className="note">—</span>}
                    </Td>
                    {/*
                      El plano va pegado al nombre y no en columna propia: como
                      la celda arranca siempre a la misma altura, las miniaturas
                      se leen igual de bien en vertical, y una columna mas
                      empujaba «Editar» y «Borrar» fuera de la tarjeta.
                    */}
                    <Td>
                      <div className="flex items-start gap-2">
                        <CeldaPlano
                          unit={unit}
                          editable={editable}
                          onAbrir={() => unit.id && setImagenesDe(unit.id)}
                        />
                        <div className="min-w-0">
                          <strong className="font-medium">{unit.name}</strong>
                          {auto && (
                            <span className="ml-2 align-middle">
                              <Badge tone="blue">automática</Badge>
                            </span>
                          )}
                          {unit.id === null && (
                            <div className="note mt-0.5">
                              Unidades del proyecto que todavía no pertenecen a ninguna
                              tipología
                            </div>
                          )}
                          {unit.description && (
                            <div className="note mt-0.5">{unit.description}</div>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td num hideSm>
                      {unit.bedrooms ?? '—'}
                    </Td>
                    <Td num hideSm>
                      {unit.bathrooms ?? '—'}
                    </Td>
                    <Td num>{rango(unit.minArea, unit.maxArea)}</Td>
                    <Td num>{moneyShort(unit.minPrice)}</Td>
                    <Td num>
                      {unit.units === 0 ? (
                        <span className="note">sin unidades</span>
                      ) : (
                        `${number(unit.available)}/${number(unit.units)}`
                      )}
                    </Td>
                    {editable && (
                      <Td className="w-[210px]">
                        {unit.id === null ? null : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Subir ${unit.name}`}
                              disabled={moving || index <= 0}
                              onClick={() => void mover(index, -1)}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Bajar ${unit.name}`}
                              disabled={moving || index === reales.length - 1}
                              onClick={() => void mover(index, 1)}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              // Una AUTO la reescribe el sistema en cuanto cambian
                              // las areas: lo que se editase aqui duraria hasta el
                              // siguiente recalculo.
                              disabled={auto}
                              title={
                                auto
                                  ? 'La mantiene el sistema: no se edita a mano'
                                  : undefined
                              }
                              onClick={() => setEditingId(unit.id)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={auto}
                              title={
                                auto
                                  ? 'La mantiene el sistema: no se borra a mano'
                                  : undefined
                              }
                              onClick={() => setDeleting(unit)}
                            >
                              Borrar
                            </Button>
                          </div>
                        )}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}

        {/* La explicacion va en la pantalla y no en un tooltip: quien ve una fila
            azulada tiene que entender ahi mismo por que no la puede tocar. */}
        {reales.length > 0 && (
          <p className="note border-t px-5 py-3">
            {conPlano === reales.length
              ? 'Todas las tipologías tienen plano.'
              : conPlano === 0
                ? 'Ninguna tipología tiene plano todavía. El plano es lo que el comprador mira para decidir entre el Tipo A y el Tipo B.'
                : `${conPlano} de ${reales.length} tipologías tienen plano.`}{' '}
            {editable && 'Pulsa el recuadro de la columna «Plano» para subirlo o cambiarlo.'}
          </p>
        )}

        {hayAuto && <p className="note border-t px-5 py-3">{AUTO_NOTA}</p>}
      </Card>

      {creating && (
        <UnitTypeForm
          familyId={familyId}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            onChange();
          }}
        />
      )}

      {editingId && (
        <UnitTypeForm
          familyId={familyId}
          unitTypeId={editingId}
          onClose={() => setEditingId(null)}
          onDone={() => {
            setEditingId(null);
            onChange();
          }}
        />
      )}

      {abierta?.id && (
        <ImagenesTipologia
          unit={abierta}
          editable={editable}
          onClose={() => setImagenesDe(null)}
          onChange={onChange}
        />
      )}

      {deleting && (
        <DeleteUnitTypeModal
          unit={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            onChange();
          }}
        />
      )}
    </>
  );
}

/** Los planos de una tipología, en el orden en que se enseñan. */
function planos(unit: UnitTypeSummary): MediaImage[] {
  return (unit.images ?? []).filter((image) => image.kind === 'FLOOR_PLAN');
}

/**
 * Si esta tipología tiene plano, ahí mismo, sin abrirla.
 *
 * Es la razón de que esta columna exista. El plano es lo que el comprador abre
 * para decidir entre el Tipo A y el Tipo B, así que la pregunta «¿cuáles me
 * faltan por subir?» tiene que contestarse recorriendo la lista con la vista y
 * no entrando en las tipologías una por una.
 *
 * La miniatura va a `contain` sobre blanco: un plano recortado a la caja pierde
 * las cotas y la orientación, que es justo lo que se mira en él.
 */
function CeldaPlano({
  unit,
  editable,
  onAbrir,
}: {
  unit: UnitTypeSummary;
  editable: boolean;
  onAbrir: () => void;
}) {
  // La fila de «sin clasificar» no es una tipología: no tiene nada que subir.
  if (!unit.id) return null;

  const laminas = planos(unit);
  const otras = (unit.images ?? []).length - laminas.length;

  if (laminas.length === 0) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        title={
          editable
            ? `Subir el plano de ${unit.name}`
            : `${unit.name} no tiene plano`
        }
        className="flex h-9 w-12 flex-col items-center justify-center gap-0.5 rounded border border-dashed text-[0.5rem] leading-none text-muted-foreground transition-colors hover:border-solid hover:bg-secondary"
      >
        <Ruler className="size-3.5" aria-hidden />
        Sin plano
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`Ver el plano de ${unit.name}`}
      className="relative block h-9 w-12 overflow-hidden rounded border bg-white transition-colors hover:border-primary"
    >
      <img
        src={laminas[0].url}
        alt={`Plano de ${unit.name}`}
        loading="lazy"
        decoding="async"
        className="size-full object-contain p-0.5"
      />
      {/* Que haya más de una lámina —planta y alzado, o dos orientaciones— es
          un dato distinto de tener plano, y también se lee de un vistazo. */}
      {(laminas.length > 1 || otras > 0) && (
        <span className="tabular absolute right-0 bottom-0 rounded-tl bg-black/70 px-1 text-[0.5625rem] font-bold text-white">
          +{laminas.length - 1 + otras}
        </span>
      )}
    </button>
  );
}

/**
 * Las imágenes de una tipología: sus planos y, si los hay, sus renders.
 *
 * En un modal y no en la propia fila porque la lista es para comparar las
 * tipologías entre sí, y una rejilla de fotos abierta dentro de una fila la
 * rompe. Se sube con la misma pieza que el proyecto y que el inmueble: lo
 * único que cambia es que aquí lo que se sube por defecto es un plano.
 */
function ImagenesTipologia({
  unit,
  editable,
  onClose,
  onChange,
}: {
  unit: UnitTypeSummary;
  editable: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  return (
    <Modal title={`Imágenes de ${unit.name}`} onClose={onClose} wide>
      <Gallery
        path={`/unit-types/${unit.id}`}
        images={unit.images ?? []}
        editable={editable}
        onChange={onChange}
        title="Planos e imágenes"
        vacio="Sube aquí el plano de esta tipología: es lo que el comprador abre para decidir entre el Tipo A y el Tipo B."
        nota="Lo que subas aquí entra como plano. Si alguna es una foto —un render, el apartamento modelo— márcala como foto con el botón de la miniatura."
        defaultKind="FLOOR_PLAN"
      />
    </Modal>
  );
}

/** «58 m²» cuando el rango no es rango; «58–64 m²» cuando si lo es. */
function rango(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  if (min === null) return area(max);
  if (max === null || min === max) return area(min);
  return `${number(min)}–${area(max)}`;
}

/**
 * Alta y edicion de una tipologia.
 *
 * Solo crea `FIXED`: la clase no se ofrece porque `AUTO` es una decision del
 * sistema, y una automatica escrita a mano seria una fila que el recalculo se
 * lleva por delante.
 */
function UnitTypeForm({
  familyId,
  unitTypeId,
  onClose,
  onDone,
}: {
  familyId: string;
  unitTypeId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const existentes = useFetch<UnitType[]>(
    (signal) =>
      api.get<UnitType[]>(`/families/${familyId}/unit-types/raw`, undefined, signal),
    [familyId],
  );
  const existing = (existentes.data ?? []).find((unit) => unit.id === unitTypeId);

  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    bedrooms: '',
    bathrooms: '',
    garages: '',
    areaMin: '',
    areaMax: '',
    builtArea: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // La tipologia que se edita llega en la misma peticion que las demas, asi que
  // el formulario se rellena cuando aterriza y no al montarse.
  useEffect(() => {
    if (!existing) return;
    setForm({
      code: existing.code,
      name: existing.name,
      description: existing.description ?? '',
      bedrooms: existing.bedrooms?.toString() ?? '',
      bathrooms: existing.bathrooms?.toString() ?? '',
      garages: existing.garages?.toString() ?? '',
      areaMin: existing.areaMin ?? '',
      areaMax: existing.areaMax ?? '',
      builtArea: existing.builtArea ?? '',
    });
  }, [existing]);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      bedrooms: numeroOpcional(form.bedrooms),
      bathrooms: numeroOpcional(form.bathrooms),
      garages: numeroOpcional(form.garages),
      areaMin: numeroOpcional(form.areaMin),
      areaMax: numeroOpcional(form.areaMax),
      builtArea: numeroOpcional(form.builtArea),
    };
    try {
      if (unitTypeId) await api.patch(`/unit-types/${unitTypeId}`, payload);
      else await api.post(`/families/${familyId}/unit-types`, payload);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar la tipología.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Editar sin haber recibido aun la tipologia enseñaria campos vacios, y
  // guardar desde ahi la dejaria en blanco.
  const cargando = Boolean(unitTypeId) && existentes.loading;
  const listo =
    !cargando && form.code.trim().length > 0 && form.name.trim().length >= 2;

  return (
    <Modal
      title={unitTypeId ? 'Editar tipología' : 'Nueva tipología'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!listo} onClick={() => void save()}>
            {unitTypeId ? 'Guardar cambios' : 'Crear tipología'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {cargando && <Loading rows={4} />}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,110px)_minmax(0,1fr)]">
          <Field
            label="Código"
            required
            autoFocus
            maxLength={8}
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="A"
            hint="Único en el proyecto"
          />
          <Field
            label="Nombre"
            required
            maxLength={160}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Tipo A · 2 alcobas · 58 m²"
            hint="Es lo que el comprador lee en la ficha del proyecto"
          />
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
          <Field
            label="Alcobas"
            type="number"
            min={0}
            max={60}
            value={form.bedrooms}
            onChange={(e) => set('bedrooms', e.target.value)}
          />
          <Field
            label="Baños"
            type="number"
            min={0}
            max={60}
            value={form.bathrooms}
            onChange={(e) => set('bathrooms', e.target.value)}
          />
          <Field
            label="Garajes"
            type="number"
            min={0}
            max={60}
            value={form.garages}
            onChange={(e) => set('garages', e.target.value)}
          />
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
          <Field
            label="Área desde (m²)"
            type="number"
            min={0}
            step="0.01"
            value={form.areaMin}
            onChange={(e) => set('areaMin', e.target.value)}
          />
          <Field
            label="Área hasta (m²)"
            type="number"
            min={0}
            step="0.01"
            value={form.areaMax}
            onChange={(e) => set('areaMax', e.target.value)}
          />
          <Field
            label="Área construida (m²)"
            type="number"
            min={0}
            step="0.01"
            value={form.builtArea}
            onChange={(e) => set('builtArea', e.target.value)}
          />
        </div>

        {/* El rango existe porque una tipologia real no es exacta: el mismo Tipo A
            mide 58 m² en el segundo piso y 58,4 en el octavo. */}
        <p className="note">
          El área va como rango porque las unidades de un mismo tipo no miden todas
          exactamente igual. Si lo dejas vacío, se calcula midiendo sus inmuebles.
        </p>

        <TextareaField
          label="Descripción"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Lo que distingue a esta tipología de las demás del proyecto."
        />
      </div>
    </Modal>
  );
}

/**
 * Borrado con la cuenta delante.
 *
 * Se pregunta en un modal y no con un `confirm` del navegador porque lo que hay
 * que dejar claro es el numero: al borrar la tipologia sus inmuebles se quedan
 * sin ella, y quien la borra tiene que ver cuantos son antes de decidir.
 */
function DeleteUnitTypeModal({
  unit,
  onClose,
  onDone,
}: {
  unit: UnitTypeSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/unit-types/${unit.id}`);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo borrar la tipología.',
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Borrar "${unit.name}"`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={busy} onClick={() => void remove()}>
            Borrar tipología
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        {unit.units > 0 ? (
          <Alert tone="warn">
            {unit.units === 1
              ? 'Hay 1 inmueble con esta tipología y se quedará sin ella.'
              : `Hay ${number(unit.units)} inmuebles con esta tipología y se quedarán sin ella.`}{' '}
            No se borra ningún inmueble: seguirán en el proyecto, pero saldrán sin
            clasificar hasta que les asignes otra.
          </Alert>
        ) : (
          <p className="text-sm">
            Ningún inmueble tiene esta tipología, así que borrarla no afecta al
            inventario.
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          La tipología desaparece del proyecto y de la web pública. El código{' '}
          {`«${unit.code}»`} vuelve a quedar libre.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Selector de tipologia para la ficha y el formulario de un inmueble.
 *
 * Ofrece solo las del proyecto al que pertenece el inmueble —ponerle el «Tipo
 * A» de otro edificio dejaria su ficha enseñando un plano ajeno, y la API lo
 * rechaza— y se apaga con la explicacion a la vista cuando no hay proyecto.
 */
export function UnitTypeSelect({
  familyId,
  value,
  onChange,
  label = 'Tipología',
  className,
}: {
  familyId: string;
  value: string;
  onChange: (unitTypeId: string) => void;
  label?: string;
  className?: string;
}) {
  const unitTypes = useFetch<UnitType[]>(
    (signal) =>
      familyId
        ? api.get<UnitType[]>(`/families/${familyId}/unit-types/raw`, undefined, signal)
        : Promise.resolve([]),
    [familyId],
  );

  const opciones = unitTypes.data ?? [];
  const vacio = Boolean(familyId) && !unitTypes.loading && opciones.length === 0;
  // Que la puesta sea automatica cambia lo que hay que contarle a quien mira:
  // no es una eleccion suya, y va a moverse sola si cambia el area.
  const automatica =
    opciones.find((unit) => unit.id === value)?.kind === 'AUTO';

  return (
    <SelectField
      label={label}
      className={className}
      value={value}
      disabled={!familyId || vacio}
      onChange={(e) => onChange(e.target.value)}
      hint={
        !familyId
          ? 'El inmueble no está en ningún proyecto: elige uno y aquí saldrán sus tipologías'
          : vacio
            ? 'Este proyecto todavía no tiene tipologías: créalas en su ficha'
            : automatica
              ? 'Esta se la puso el sistema por su área y volverá a moverse si el área cambia. Elige una escrita a mano si quieres que se quede donde tú digas.'
              : 'Solo las tipologías de este proyecto'
      }
    >
      <option value="">Sin tipología</option>
      {opciones.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {unit.code} · {unit.name}
          {unit.kind === 'AUTO' ? ' (automática)' : ''}
        </option>
      ))}
    </SelectField>
  );
}

/** Convierte "" en undefined: la API rechaza los campos numericos vacios. */
function numeroOpcional(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}
