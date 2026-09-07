import { useMemo, useState } from 'react';
import { Camera, Crop, SlidersHorizontal, Wand2 } from 'lucide-react';

import { Alert, Badge, Card } from '@/components/ui';
import { type MediaImage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { imagenesIA, type RevisionInmueble } from '@/lib/imagenes-ia';
import {
  dolares,
  encuadreDe,
  retoque as apiRetoque,
  superficiePerdida,
  type Encuadre,
  type EstadoRetoque,
  type ResumenRetoque,
} from '@/lib/retoque';
import { FichaFoto } from './FichaFoto';
import { cn } from '@/lib/utils';

/**
 * El revelado, el encuadre y el retoque de las fotos de un inmueble.
 *
 * Va debajo de la revisión con IA y con el mismo criterio que ella: la galería
 * de arriba es el inventario —lo que hay—, la revisión dice si la foto está
 * bien, y esto es lo que se le puede hacer. Separarlo de la galería evita
 * además que subir una foto y retocarla compartan barra de botones, que son dos
 * momentos distintos del trabajo.
 *
 * La rejilla pinta miniaturas y solo miniaturas. Al abrir una foto es cuando se
 * piden los tamaños grandes, que es cuando se mira de verdad: con 6.306 fotos
 * reales, algunas de varios megas, lo contrario deja la ficha inservible en el
 * móvil de un asesor.
 *
 * El encuadre no se pide aparte: viaja dentro del análisis que ya existe. Si
 * nadie ha analizado el inmueble no hay propuesta que enseñar, y eso es
 * correcto — la propuesta es una lectura del análisis, no otra cosa que pagar.
 */
export function RetoqueFotos({
  propertyId,
  images,
  editable,
  onChange,
}: {
  propertyId: string;
  images: MediaImage[];
  editable: boolean;
  /** La galería de arriba tiene que repintarse cuando algo cambia. */
  onChange: () => void;
}) {
  const { can } = useAuth();
  const [abierta, setAbierta] = useState<string | null>(null);

  const estado = useFetch<{ retouch?: EstadoRetoque } | null>(
    (signal) => apiRetoque.estado(signal),
    [],
  );
  const revision = useFetch<RevisionInmueble | null>(
    (signal) =>
      imagenesIA.revision(propertyId, signal).catch(() => null),
    [propertyId],
  );
  const resumen = useFetch<ResumenRetoque | null>(
    (signal) => apiRetoque.resumen(propertyId, signal),
    [propertyId],
  );

  /**
   * El encuadre vigente de cada foto.
   *
   * La API devuelve una fila por (foto, versión de prompt, modelo) y las trae
   * de la más nueva a la más vieja, así que la primera de cada foto es la que
   * cuenta. Mismo criterio que usa `RevisionImagenes`: si se cambiara aquí, la
   * ficha enseñaría dos verdades distintas sobre la misma foto.
   */
  const porImagen = useMemo(() => {
    const mapa = new Map<string, Encuadre>();
    for (const fila of revision.data?.images ?? []) {
      if (mapa.has(fila.propertyImageId)) continue;
      const encuadre = encuadreDe(fila);
      if (encuadre) mapa.set(fila.propertyImageId, encuadre);
    }
    return mapa;
  }, [revision.data]);

  const puede = editable && can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER', 'AGENT');

  function recargar() {
    revision.reload();
    resumen.reload();
    onChange();
  }

  /* Mientras se carga no hay nada que decir. Sin fotos tampoco. */
  if (estado.loading) return null;
  if (images.length === 0) return null;

  const retoqueHabilitado = estado.data?.retouch?.enabled === true;
  const reveladas = images.filter((i) => i.developedAt != null).length;
  const retocadas = images.filter((i) => i.retouchId).length;
  const conRecorte = images.filter(
    (i) => (porImagen.get(i.id)?.cortes.length ?? 0) > 0,
  ).length;
  const aRepetir = images.filter((i) => porImagen.get(i.id)?.via === 'REPETIR').length;

  const foto = abierta ? images.find((i) => i.id === abierta) : null;

  return (
    <Card
      title={
        <h3 className="micro-label flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden /> Revelado y retoque
        </h3>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Lo que hay, en una línea. El asesor abre una foto porque algo de
            este resumen le llamó la atención, no al revés. */}
        <p className="text-sm text-muted-foreground">
          {reveladas === images.length
            ? 'Todas las fotos están reveladas. '
            : `${reveladas} de ${images.length} ${reveladas === 1 ? 'foto revelada' : 'fotos reveladas'}. `}
          El revelado —luz, contraste y color— se aplica solo al subir y se puede
          deshacer foto a foto; el encuadre no se toca nunca sin que alguien lo mire.
          {aRepetir > 0 && (
            <>
              {' '}
              <strong className="font-medium text-foreground">
                {aRepetir === 1
                  ? 'Una foto pide volver a la casa'
                  : `${aRepetir} fotos piden volver a la casa`}
              </strong>
              : eso no lo arregla ningún programa.
            </>
          )}
          {porImagen.size === 0 && revision.data !== null && (
            <> Todavía no hay propuesta de encuadre: sale del análisis con IA de arriba.</>
          )}
        </p>

        {retocadas > 0 && (
          /* Se dice arriba y no solo en cada tarjeta: mirando foto a foto no se
             ve cuántas de las publicadas son generadas, y ese número es el que
             importa cuando un comprador llega a la casa. */
          <Alert tone="warn">
            {retocadas === 1
              ? 'Una de las fotos publicadas de este inmueble no es una fotografía: es un retoque de IA.'
              : `${retocadas} de las fotos publicadas de este inmueble no son fotografías: son retoques de IA.`}{' '}
            {resumen.data && resumen.data.alteranLaRealidad > 0
              ? `${resumen.data.alteranLaRealidad === 1 ? 'Uno de ellos altera' : `${resumen.data.alteranLaRealidad} de ellos alteran`} lo que hay en la casa, no solo cómo se ve.`
              : 'Comprueba que la casa se parece a lo que se enseña.'}
          </Alert>
        )}

        <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5 p-0">
          {images.map((image, indice) => (
            <TileRetoque
              key={image.id}
              image={image}
              indice={indice}
              encuadre={porImagen.get(image.id) ?? null}
              onAbrir={() => setAbierta(image.id)}
            />
          ))}
        </ul>

        {/* Lo gastado, al final y sin adornos. Se suma todo lo intentado y no
            solo lo publicado: un descarte también se pagó, y una cuenta que
            solo mira los aciertos miente sobre lo que cuesta la función. */}
        {resumen.data && resumen.data.intentos > 0 && (
          <p className="tabular text-xs text-muted-foreground">
            {resumen.data.intentos === 1
              ? '1 retoque pedido'
              : `${resumen.data.intentos} retoques pedidos`}
            , {resumen.data.aplicados} publicados · {dolares(resumen.data.costeTotalUsd)} en
            total, descartes incluidos.
          </p>
        )}

        {conRecorte > 0 && (
          <p className="text-xs text-muted-foreground">
            {conRecorte === 1
              ? 'Hay 1 foto con propuesta de recorte.'
              : `Hay ${conRecorte} fotos con propuesta de recorte.`}{' '}
            Ábrelas para ver cómo quedarían: el recorte no se aplica sin que se vea
            primero.
          </p>
        )}
      </div>

      {foto && (
        <FichaFoto
          propertyId={propertyId}
          image={foto}
          posicion={images.findIndex((i) => i.id === foto.id) + 1}
          total={images.length}
          encuadre={porImagen.get(foto.id) ?? null}
          retoqueHabilitado={retoqueHabilitado}
          /* El coste de un análisis no lo publica la API todavía, así que la
             comparación «cuesta N veces analizarla» no se enseña. Inventarla
             sería peor que no darla. */
          costeAnalisisUsd={null}
          editable={puede}
          onClose={() => setAbierta(null)}
          onCambio={recargar}
        />
      )}
    </Card>
  );
}

/**
 * Una foto en la rejilla, con lo que hay que saber de ella sin abrirla.
 *
 * Tres distintivos y ninguno decorativo: si lo que se publica no es una
 * fotografía (porque eso cambia lo que ve un comprador), si pide volver a la
 * casa (porque cuesta un desplazamiento) y si hay un recorte propuesto (porque
 * es algo que mirar). Lo demás cabe dentro.
 */
function TileRetoque({
  image,
  indice,
  encuadre,
  onAbrir,
}: {
  image: MediaImage;
  indice: number;
  encuadre: Encuadre | null;
  onAbrir: () => void;
}) {
  const repetir = encuadre?.via === 'REPETIR';
  const cortes = encuadre?.cortes ?? [];

  return (
    <li
      className={cn(
        'relative aspect-[4/3] overflow-hidden rounded-md border bg-secondary',
        repetir && 'border-amber-300',
        image.retouchId && 'border-amber-400',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver el revelado y la propuesta de la foto ${indice + 1}`}
        className="block size-full cursor-zoom-in"
      >
        {/* Siempre la miniatura de 560 px: en un tile de 128 px el tamaño de
            ficha no aporta un píxel visible y sí varios megas. */}
        <img
          src={image.url}
          alt={image.description ?? `Foto ${indice + 1}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </button>

      {/* Todo lo que va encima de la foto es `pointer-events-none`: son
          rótulos, y la foto entera tiene que seguir siendo el botón que abre la
          ficha. Sin esto, pulsar sobre la banda de abajo —que es justo donde
          cae el pulgar en un móvil— no hacía nada. */}
      <span className="tabular pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
        {indice + 1}
      </span>

      <span className="pointer-events-none absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
        {image.retouchId && (
          <Badge tone="amber">
            <Wand2 className="size-3" aria-hidden /> IA
          </Badge>
        )}
        {repetir && (
          <Badge tone="amber">
            <Camera className="size-3" aria-hidden /> Visita
          </Badge>
        )}
      </span>

      {cortes.length > 0 && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[0.625rem] font-medium text-white">
          <Crop className="size-3" aria-hidden />
          {/* El porcentaje y no «hay un recorte»: es lo que decide si merece la
              pena abrirla. Tirar el 4% y tirar el 30% no son la misma noticia. */}
          Recorte del {superficiePerdida(cortes)}%
        </span>
      )}
    </li>
  );
}
