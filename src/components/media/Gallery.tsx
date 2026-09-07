import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  RotateCcw,
  Ruler,
  Star,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { ApiError, api, type ImageKind, type MediaImage } from '@/lib/api';
import {
  ACCEPT_IMAGENES,
  useImageUploads,
  type UploadItem,
  type UploadWarning,
} from '@/lib/uploads';
import { Alert, Badge, Button, Card, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Visor } from './Visor';

/**
 * La galería de fotos del panel.
 *
 * La misma pieza para las tres cosas que se gestionan con fotos —el inmueble,
 * el proyecto y el plano de la tipología— porque el asesor no tiene por qué
 * aprender tres formas de subir una imagen. Lo único que cambia entre ellas es
 * la ruta de la API, que llega por `path`.
 *
 * Dos decisiones que se ven en pantalla y conviene tener escritas:
 *
 * - La rejilla pinta SIEMPRE `url`, la miniatura de 560 px. Hay 6.306 fotos
 *   reales y algunas son pesadas: veinte originales en una rejilla de 120 px
 *   son varios megas para enseñar sellos de correos. El tamaño grande solo se
 *   pide al abrir el visor, que es cuando se mira de verdad.
 * - La portada va siempre en primer lugar. La API guarda el orden y la portada
 *   por separado, pero tener una portada que no es la primera foto no lo
 *   entiende nadie: aquí, marcar portada la mueve al puesto 1.
 */

export function Gallery({
  path,
  images,
  editable,
  onChange,
  title,
  vacio,
  nota,
  defaultKind = 'PHOTO',
}: {
  /** Base de la API sin `/api/v1`; por ejemplo `/properties/<id>`. */
  path: string;
  images: MediaImage[];
  editable: boolean;
  onChange: () => void;
  title: string;
  /** Qué decirle a quien todavía no ha subido ninguna. */
  vacio: string;
  /** Para qué sirven estas fotos, cuando no es evidente. */
  nota?: string;
  /**
   * Qué se sube por defecto aquí.
   *
   * En una tipología lo normal es el plano y en un inmueble la foto, así que
   * el recuadro ya viene con la respuesta puesta. Cada imagen se puede
   * cambiar después una a una: lo decide el dato `kind`, no el sitio donde se
   * subió.
   */
  defaultKind?: ImageKind;
}) {
  const [orden, setOrden] = useState<MediaImage[]>(images);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState<MediaImage | null>(null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [soltando, setSoltando] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const subida = useImageUploads({
    path: `${path}/images`,
    campos: { kind: defaultKind },
    onSettled: onChange,
  });

  // El orden local existe para que arrastrar se vea al instante; la lista de
  // arriba manda en cuanto la recarga trae la de verdad.
  useEffect(() => {
    setOrden(images);
    /*
      Y ese es el momento de retirar los tiles de subida ya terminados: la foto
      de verdad acaba de llegar en la recarga, así que hasta aquí el tile hacía
      falta —si se quitase al terminar la petición, la miniatura desaparecería
      un instante antes de aparecer la definitiva— y a partir de aquí sobra.
    */
    subida.clearDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const total = orden.length;

  /*
    Reordenar manda SIEMPRE la lista entera: la API reparte las posiciones por
    el índice del array, así que un envío parcial dejaría a las que faltan con
    la posición vieja y el orden saldría mezclado.
  */
  const guardarOrden = useCallback(
    async (lista: MediaImage[]) => {
      setOcupado(true);
      setError(null);
      try {
        await api.put(`${path}/images/order`, { imageIds: lista.map((i) => i.id) });
        onChange();
      } catch (err) {
        setOrden(images); // Se deshace lo que se veía: el servidor no lo aceptó.
        setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el orden.');
      } finally {
        setOcupado(false);
      }
    },
    [images, onChange, path],
  );

  /** Mueve una foto `salto` puestos y guarda. Es el camino táctil del arrastre. */
  async function mover(index: number, salto: -1 | 1) {
    const destino = index + salto;
    if (destino < 0 || destino >= total) return;
    const lista = [...orden];
    [lista[index], lista[destino]] = [lista[destino], lista[index]];
    setOrden(lista);
    await guardarOrden(lista);
  }

  /**
   * Marca la portada y la sube al primer puesto, en ese orden.
   *
   * Son dos peticiones porque son dos cosas distintas en la API, pero para
   * quien mira es una sola: la foto que representa al inmueble en la tarjeta,
   * en los portales y en la web.
   */
  async function hacerPortada(image: MediaImage) {
    setOcupado(true);
    setError(null);
    try {
      await api.patch(`${path}/images/${image.id}/main`);
      const resto = orden.filter((i) => i.id !== image.id);
      await api.put(`${path}/images/order`, {
        imageIds: [image, ...resto].map((i) => i.id),
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la portada.');
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Cambia foto ↔ plano.
   *
   * Se decide aquí y no al subir porque en la práctica se sube todo junto: se
   * arrastran las quince imágenes de la carpeta del proyecto y luego se dice
   * cuáles de ellas eran los planos.
   */
  async function cambiarTipo(image: MediaImage) {
    const kind: ImageKind = image.kind === 'FLOOR_PLAN' ? 'PHOTO' : 'FLOOR_PLAN';
    setOcupado(true);
    setError(null);
    try {
      await api.patch(`${path}/images/${image.id}`, { kind });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el tipo de imagen.');
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(image: MediaImage) {
    setOcupado(true);
    setError(null);
    try {
      await api.delete(`${path}/images/${image.id}`);
      setBorrando(null);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar la foto.');
    } finally {
      setOcupado(false);
    }
  }

  // --- arrastre para reordenar -------------------------------------------

  const origen = useRef<number | null>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  function alEntrar(index: number) {
    if (origen.current === null || origen.current === index) return;
    const lista = [...orden];
    const [movida] = lista.splice(origen.current, 1);
    lista.splice(index, 0, movida);
    origen.current = index;
    setArrastrando(index);
    setOrden(lista);
  }

  function alSoltar() {
    origen.current = null;
    setArrastrando(null);
    // Solo se manda si el orden cambió de verdad: arrastrar y devolver la foto
    // a su sitio no tiene por qué escribir en la base.
    const igual = orden.every((image, i) => image.id === images[i]?.id);
    if (!igual) void guardarOrden(orden);
  }

  /** Distingue soltar ficheros del escritorio de arrastrar una foto ya subida. */
  function traeFicheros(event: DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  /*
    Las terminadas siguen en la rejilla hasta que la recarga trae la foto real.
    Las que fallaron NO: se van a la lista de abajo. En un tile de 128 px el
    motivo hay que recortarlo a cuatro lineas de 11 px, y el motivo es justo lo
    que hay que leer entero para saber si la foto se repite o se gira.
  */
  const pendientes = subida.items.filter((item) => item.state !== 'error');
  const enCola = subida.items.filter(
    (item) => item.state === 'pending' || item.state === 'uploading',
  ).length;

  return (
    <>
      <Card
        title={`${title} · ${total}`}
        action={
          editable && (
            <div className="flex items-center gap-2">
              {subida.subiendo && (
                <span className="note">
                  {enCola === 1 ? 'subiendo 1…' : `subiendo ${enCola}…`}
                </span>
              )}
              {/*
                El botón no se bloquea mientras sube. Con una línea de oficina
                una tanda tarda minutos, y en ese rato lo normal es seguir
                eligiendo carpetas: la cola las va encadenando.
              */}
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" />
                {defaultKind === 'FLOOR_PLAN' ? 'Subir imágenes' : 'Subir fotos'}
              </Button>
            </div>
          )
        }
      >
        {editable && (
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_IMAGENES}
            multiple
            hidden
            onChange={(e) => {
              subida.add(e.target.files);
              // Sin esto, volver a elegir el mismo fichero no dispara `change`.
              e.target.value = '';
            }}
          />
        )}

        <div
          className={cn(
            'relative flex flex-col gap-4 rounded-md transition-colors',
            soltando && 'outline-2 outline-offset-4 outline-dashed outline-primary',
          )}
          onDragOver={(e) => {
            if (!editable || !traeFicheros(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setSoltando(true);
          }}
          onDragLeave={(e) => {
            // `dragleave` salta también al pasar sobre los hijos: solo cuenta
            // cuando el puntero sale del bloque entero.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setSoltando(false);
          }}
          onDrop={(e) => {
            if (!editable || !traeFicheros(e)) return;
            e.preventDefault();
            setSoltando(false);
            subida.add(e.dataTransfer.files);
          }}
        >
          {error && (
            <Alert
              action={
                <Button variant="outline" size="sm" onClick={() => setError(null)}>
                  Cerrar
                </Button>
              }
            >
              {error}
            </Alert>
          )}

          {total === 0 && pendientes.length === 0 ? (
            <div className="rounded-md border border-dashed px-5 py-10 text-center">
              <p className="font-medium">Sin fotos todavía</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{vacio}</p>
              {editable && (
                <Button className="mt-4" onClick={() => fileInput.current?.click()}>
                  <Upload className="size-4" />
                  Subir las primeras
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5 p-0">
              {orden.map((image, index) => (
                <Tile
                  key={image.id}
                  image={image}
                  index={index}
                  total={total}
                  editable={editable}
                  ocupado={ocupado}
                  arrastrando={arrastrando === index}
                  onDragStart={() => {
                    origen.current = index;
                    setArrastrando(index);
                  }}
                  onDragEnter={() => alEntrar(index)}
                  onDragEnd={alSoltar}
                  onVer={() => setViendo(index)}
                  onMover={(salto) => void mover(index, salto)}
                  onPortada={() => void hacerPortada(image)}
                  onTipo={() => void cambiarTipo(image)}
                  onBorrar={() => setBorrando(image)}
                />
              ))}

              {/* Las que están subiendo van al final de la rejilla, que es donde
                  van a quedarse: así el orden que se ve es el orden que habrá. */}
              {pendientes.map((item) => (
                <TileSubiendo
                  key={item.id}
                  item={item}
                  onDismiss={() => subida.dismiss(item.id)}
                />
              ))}
            </ul>
          )}

          {subida.fallidas.length > 0 && (
            <Rechazadas
              fallidas={subida.fallidas}
              onRetry={subida.retry}
              onDismiss={subida.dismiss}
            />
          )}

          {subida.avisos.length > 0 && (
            <Avisadas avisos={subida.avisos} onDismiss={subida.dismissWarning} />
          )}

          {(total > 0 || nota) && (
            <p className="note">
              {nota ? `${nota} ` : ''}
              {total > 0 && editable && (
                <>
                  La primera es la portada: es la que sale en la tarjeta del listado y en
                  los portales. Arrastra para cambiar el orden, o usa las flechas si vas
                  desde el móvil.
                </>
              )}
            </p>
          )}

          {soltando && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-md bg-background/85">
              <p className="font-medium">Suelta las fotos aquí</p>
            </div>
          )}
        </div>
      </Card>

      {viendo !== null && orden[viendo] && (
        <Visor
          images={orden}
          index={viendo}
          onIndex={setViendo}
          onClose={() => setViendo(null)}
          editable={editable}
          ocupado={ocupado}
          /*
            Hacer portada recoloca la lista, así que el índice que se está
            mirando dejaría de señalar a esta imagen: se cierra el visor y lo
            que queda a la vista es la rejilla ya reordenada.
          */
          onPortada={() => {
            const image = orden[viendo];
            setViendo(null);
            void hacerPortada(image);
          }}
          onTipo={() => void cambiarTipo(orden[viendo])}
          onBorrar={() => {
            const image = orden[viendo];
            setViendo(null);
            setBorrando(image);
          }}
        />
      )}

      {borrando && (
        <ConfirmarBorrado
          image={borrando}
          ocupado={ocupado}
          onClose={() => setBorrando(null)}
          onConfirm={() => void borrar(borrando)}
        />
      )}
    </>
  );
}

/** Una foto ya guardada. */
function Tile({
  image,
  index,
  total,
  editable,
  ocupado,
  arrastrando,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onVer,
  onMover,
  onPortada,
  onTipo,
  onBorrar,
}: {
  image: MediaImage;
  index: number;
  total: number;
  editable: boolean;
  ocupado: boolean;
  arrastrando: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onVer: () => void;
  onMover: (salto: -1 | 1) => void;
  onPortada: () => void;
  onTipo: () => void;
  onBorrar: () => void;
}) {
  const plano = image.kind === 'FLOOR_PLAN';
  return (
    <li
      draggable={editable && !ocupado}
      onDragStart={(e) => {
        // Firefox no arranca el arrastre sin datos en el portapapeles.
        e.dataTransfer.setData('text/plain', image.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDragEnd();
      }}
      className={cn(
        'group relative aspect-[4/3] overflow-hidden rounded-md border bg-secondary',
        editable && !ocupado && 'cursor-grab active:cursor-grabbing',
        arrastrando && 'opacity-40 ring-2 ring-primary',
      )}
    >
      {/* Siempre la miniatura de 560 px: la grande solo se pide en el visor.
          El plano va entero y sobre blanco —`contain`— porque recortarlo se
          come las cotas y la orientación, que es lo único que se mira en él. */}
      {/*
        La imagen entera abre el visor. En una pantalla táctil es el gesto que
        se prueba primero, y es lo que permite que aquí abajo solo hagan falta
        las flechas: el resto de acciones viven dentro del visor, con sitio para
        llevar su nombre escrito.
      */}
      <button
        type="button"
        onClick={onVer}
        aria-label={`Ampliar ${plano ? 'el plano' : 'la foto'} ${index + 1}`}
        className="block size-full cursor-zoom-in"
      >
        <img
          src={image.url}
          alt={image.description ?? (plano ? `Plano ${index + 1}` : `Foto ${index + 1}`)}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cn('size-full', plano ? 'bg-white object-contain p-1' : 'object-cover')}
        />
      </button>

      <span className="tabular absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
        {index + 1}
      </span>

      {/*
        Arriba a la derecha y no abajo: en una pantalla táctil la barra de
        acciones se ve siempre, y ahí abajo el distintivo quedaba tapado por los
        botones justo en la foto que más importa señalar.
      */}
      {(plano || image.isMain || image.aiEdited) && (
        <span className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
          {plano && <Badge tone="blue">Plano</Badge>}
          {image.isMain && <Badge tone="ink">Portada</Badge>}
          {/*
            Va aqui, en el inventario, y no solo en la pantalla de retoque. Una
            foto generada no se distingue mirandola —para eso se genera—, asi
            que si el distintivo vive solo donde se retoca, todo el que no pase
            por alli la da por real: el asesor que la manda por WhatsApp, el que
            la sube a un portal y el comprador que llega a la casa.
          */}
          {image.aiEdited && (
            <Badge tone="amber">
              <Wand2 className="size-3" aria-hidden /> IA
            </Badge>
          )}
        </span>
      )}

      {editable && (
        <>
          {/*
            En táctil solo las flechas, y en una sola fila. Con los cinco
            botones la barra ocupaba dos filas y tapaba media miniatura: en un
            móvil lo que hay que ver es la foto, y lo único que no se puede
            hacer desde el visor es recolocarla entre sus vecinas.
          */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/45 to-transparent p-1.5 md:hidden">
            <AccionTile
              label={`Mover la imagen ${index + 1} hacia atrás`}
              disabled={ocupado || index === 0}
              onClick={() => onMover(-1)}
            >
              <ChevronLeft className="size-4" />
            </AccionTile>
            <AccionTile
              label={`Mover la imagen ${index + 1} hacia delante`}
              disabled={ocupado || index === total - 1}
              onClick={() => onMover(1)}
            >
              <ChevronRight className="size-4" />
            </AccionTile>
          </div>

          {/* Con ratón sí caben las cinco, y aparecen al pasar por encima. */}
          <div className="absolute inset-x-0 bottom-0 hidden justify-center gap-1 bg-gradient-to-t from-black/75 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:flex">
            <AccionTile
              label={`Mover la imagen ${index + 1} hacia atrás`}
              disabled={ocupado || index === 0}
              onClick={() => onMover(-1)}
            >
              <ChevronLeft className="size-3.5" />
            </AccionTile>
            <AccionTile
              label={`Mover la imagen ${index + 1} hacia delante`}
              disabled={ocupado || index === total - 1}
              onClick={() => onMover(1)}
            >
              <ChevronRight className="size-3.5" />
            </AccionTile>
            <AccionTile
              label={image.isMain ? 'Ya es la portada' : `Hacer portada la imagen ${index + 1}`}
              disabled={ocupado || image.isMain}
              onClick={onPortada}
            >
              <Star className={cn('size-3.5', image.isMain && 'fill-current')} />
            </AccionTile>
            <AccionTile
              label={plano ? 'Marcar como foto normal' : 'Marcar como plano'}
              disabled={ocupado}
              onClick={onTipo}
            >
              {plano ? <ImageIcon className="size-3.5" /> : <Ruler className="size-3.5" />}
            </AccionTile>
            <AccionTile
              label={`Borrar la ${plano ? 'imagen' : 'foto'} ${index + 1}`}
              disabled={ocupado}
              onClick={onBorrar}
            >
              <Trash2 className="size-3.5" />
            </AccionTile>
          </div>
        </>
      )}
    </li>
  );
}

/** Botón cuadrado sobre la foto: sin texto, con etiqueta para el lector. */
function AccionTile({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      // El arrastre del `li` se traga el clic si el botón no lo detiene.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      // 32 px en táctil y 28 en escritorio: con el ratón se apunta, con el
      // dedo no, y estos son los botones de una miniatura de 128 px.
      className="grid size-8 place-items-center rounded bg-white/90 text-foreground shadow-sm transition-colors hover:bg-white disabled:opacity-35 disabled:hover:bg-white/90 md:size-7"
    >
      {children}
    </button>
  );
}

/**
 * Una foto en vuelo.
 *
 * Se pinta con la miniatura local, así que se ve antes de que exista en el
 * servidor, y lleva su propia barra: veinte ficheros con una sola barra global
 * no dicen cuál va y cuál falta.
 */
function TileSubiendo({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const hecha = item.state === 'done';
  return (
    <li className="relative aspect-[4/3] overflow-hidden rounded-md border bg-secondary">
      <img src={item.preview} alt="" className="size-full object-cover opacity-60" />

      {!hecha && (
        <button
          type="button"
          aria-label={`Quitar ${item.name} de la cola`}
          title="Quitar de la cola"
          onClick={onDismiss}
          className="absolute top-1 right-1 grid size-6 place-items-center rounded bg-white/90 hover:bg-white"
        >
          <X className="size-3.5" />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-background/90 px-1.5 py-1.5">
        <p className="truncate text-[0.6875rem] text-muted-foreground" title={item.name}>
          {hecha ? 'Guardada' : item.name}
        </p>
        <div
          className="mt-1 h-1 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={item.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Subiendo ${item.name}`}
        >
          <div
            className={cn(
              'h-full transition-[width] duration-200',
              hecha ? 'bg-emerald-500' : 'bg-primary',
            )}
            style={{ width: `${item.progress}%` }}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Lo que entró, pero conviene mirar.
 *
 * En ámbar y con «ya están subidas» por delante, no en rojo: son fotos
 * GUARDADAS. Pintarlas como un rechazo hace que el asesor vuelva a subir una
 * que ya está dentro y acabe duplicándola en la ficha, y no es un caso raro
 * —medido sobre el inventario real, la API avisa el doble de veces de las que
 * bloquea—. Por eso tampoco hay aquí ningún botón de reintentar.
 */
function Avisadas({
  avisos,
  onDismiss,
}: {
  avisos: UploadWarning[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        {avisos.length === 1
          ? 'Una foto ya está subida, pero mírala'
          : `${avisos.length} fotos ya están subidas, pero míralas`}
      </p>

      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {avisos.map((aviso) => (
          <li
            key={aviso.id}
            className="flex flex-wrap items-start gap-3 border-t border-amber-200 pt-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-amber-900" title={aviso.name}>
                {aviso.name}
              </p>
              {aviso.messages.map((mensaje, i) => (
                // Tal cual lo manda el servidor, uno por problema.
                <p key={i} className="text-xs text-amber-800">
                  {mensaje}
                </p>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Ya he mirado ${aviso.name}`}
              onClick={() => onDismiss(aviso.id)}
            >
              Ya la he mirado
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * La miniatura de lo que no entró.
 *
 * Con su respaldo: si el fichero no era una imagen —un PDF renombrado a
 * `.jpg`, que es de los rechazos más frecuentes— el navegador no puede pintar
 * el `objectURL` y deja el icono de imagen rota, que parece un fallo del panel
 * y no del fichero.
 */
function MiniaturaFallida({ src }: { src: string }) {
  const [roto, setRoto] = useState(false);

  if (roto) {
    return (
      <span className="grid h-11 w-14 shrink-0 place-items-center rounded border border-red-200 bg-red-100 text-red-400">
        <ImageIcon className="size-4" aria-hidden />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setRoto(true)}
      className="h-11 w-14 shrink-0 rounded border border-red-200 object-cover"
    />
  );
}

/**
 * Lo que no entró, con el motivo entero.
 *
 * Fuera de la rejilla y a texto corrido a propósito: el motivo lo escribe el
 * servidor para que el asesor sepa qué hacer con esa foto —«es vertical,
 * repítela girando el móvil», «no llega a la resolución mínima»— y eso hay que
 * poder leerlo. Dentro de una miniatura de 128 px había que recortarlo, que es
 * como no darlo.
 *
 * Lo que sí quedó guardado no se toca: una foto mala no pierde a las otras
 * diecinueve.
 */
function Rechazadas({
  fallidas,
  onRetry,
  onDismiss,
}: {
  fallidas: UploadItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-900">
        {fallidas.length === 1
          ? 'Una imagen no se pudo subir'
          : `${fallidas.length} imágenes no se pudieron subir`}
        <span className="font-normal"> · las demás sí quedaron guardadas</span>
      </p>

      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {fallidas.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start gap-3 border-t border-red-200 pt-2"
          >
            <MiniaturaFallida src={item.preview} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-red-900" title={item.name}>
                {item.name}
              </p>
              {/* Tal cual lo manda el servidor: es la instrucción de qué hacer. */}
              <p className="text-xs text-red-800">{item.reason}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {/* Sin botón cuando repetirlo daría el mismo error: el fichero ni
                  siquiera es una imagen. */}
              {item.retriable && (
                <Button variant="outline" size="sm" onClick={() => onRetry(item.id)}>
                  <RotateCcw className="size-3.5" />
                  Reintentar
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Descartar ${item.name}`}
                onClick={() => onDismiss(item.id)}
              >
                Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Borrar pregunta antes.
 *
 * No con el `confirm` del navegador: la foto que se va a borrar tiene que
 * verse, porque en una rejilla de veinte miniaturas casi iguales el nombre no
 * distingue nada.
 */
function ConfirmarBorrado({
  image,
  ocupado,
  onClose,
  onConfirm,
}: {
  image: MediaImage;
  ocupado: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="¿Borrar esta foto?"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={ocupado} onClick={onConfirm}>
            Borrar foto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <img
          src={image.url}
          alt=""
          className="aspect-[4/3] w-full rounded-md border object-cover"
        />
        <p className="text-sm text-muted-foreground">
          Se borra del servidor y no se puede deshacer.
          {image.isMain && ' Es la portada: pasará a serlo la siguiente foto.'}
        </p>
      </div>
    </Modal>
  );
}
