import { useMemo, useState } from 'react';
import { Camera, ImageOff, SlidersHorizontal, Wand2 } from 'lucide-react';

import { Alert, Badge, Button, Card } from '@/components/ui';
import { ApiError, type MediaImage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import {
  retoque as apiRetoque,
  type EstadoModuloRetoque,
  type EstadoModuloRevelado,
  type PropuestaImagen,
  type RevisionPropuesta,
  type RevisionRevelado,
  type ReveladoImagen,
} from '@/lib/retoque';
import { partir } from './Propuesta';
import { FichaFoto } from './FichaFoto';
import { cn } from '@/lib/utils';

/**
 * El revelado y el retoque de las fotos de un inmueble.
 *
 * Va debajo de la revisión con IA y con el mismo criterio que ella: la galería
 * de arriba es el inventario —lo que hay— y esto es lo que se le puede hacer.
 * Separarlo de la galería evita además que subir una foto y retocarla se
 * mezclen en la misma barra de botones, que son dos momentos distintos del
 * trabajo.
 *
 * La rejilla pinta miniaturas y solo miniaturas. Al abrir una foto es cuando se
 * piden los tamaños grandes, que es cuando se mira de verdad: con 6.306 fotos
 * reales, algunas de varios megas, lo contrario deja la ficha inservible en el
 * móvil de un asesor.
 *
 * Los tres módulos que alimentan esto se están escribiendo en paralelo. Si el
 * servidor no tiene ninguno, la tarjeta entera no se pinta y nadie se entera;
 * si tiene unos y no otros, se pinta lo que haya. Un 404 aquí no es un error,
 * es una versión.
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
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const estadoRevelado = useFetch<EstadoModuloRevelado | null>(
    (signal) => apiRetoque.estadoRevelado(signal),
    [],
  );
  const estadoRetoque = useFetch<EstadoModuloRetoque | null>(
    (signal) => apiRetoque.estadoRetoque(signal),
    [],
  );
  const revelado = useFetch<RevisionRevelado | null>(
    (signal) => apiRetoque.revelado(propertyId, signal),
    [propertyId],
  );
  const propuesta = useFetch<RevisionPropuesta | null>(
    (signal) => apiRetoque.propuesta(propertyId, signal),
    [propertyId],
  );

  const porRevelado = useMemo(
    () => new Map((revelado.data?.images ?? []).map((r) => [r.propertyImageId, r])),
    [revelado.data],
  );
  const porPropuesta = useMemo(
    () => new Map((propuesta.data?.images ?? []).map((p) => [p.propertyImageId, p])),
    [propuesta.data],
  );

  const puede = editable && can('ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER', 'AGENT');

  function recargar() {
    revelado.reload();
    propuesta.reload();
    onChange();
  }

  async function pedirPropuesta() {
    setOcupado(true);
    setError(null);
    try {
      await apiRetoque.proponer(propertyId, {});
      propuesta.reload();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Este servidor todavía no sabe proponer retoques.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo pedir la propuesta.',
      );
    } finally {
      setOcupado(false);
    }
  }

  /* Mientras se carga no hay nada que decir, y si NINGUNO de los tres módulos
     existe la tarjeta no tiene por qué ocupar sitio en la ficha. */
  if (estadoRevelado.loading || estadoRetoque.loading) return null;
  const hayAlgo =
    estadoRevelado.data !== null || estadoRetoque.data !== null || propuesta.data !== null;
  if (!hayAlgo) return null;
  if (images.length === 0) return null;

  const reveladas = images.filter((i) => porRevelado.get(i.id)?.estado === 'HECHO').length;
  const retocadas = images.filter((i) => i.aiEdited).length;
  const conVisita = images.filter(
    (i) => (porPropuesta.get(i.id)?.sugerencias ?? []).some((s) => s.destino === 'REVISITA'),
  ).length;
  const sinPropuesta = propuesta.data === null ? 0 : images.filter((i) => !porPropuesta.has(i.id)).length;

  const foto = abierta ? images.find((i) => i.id === abierta) : null;

  return (
    <Card
      title={
        <h3 className="micro-label flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden /> Revelado y retoque
        </h3>
      }
      action={
        puede &&
        propuesta.data !== null &&
        sinPropuesta > 0 && (
          <Button variant="outline" size="sm" loading={ocupado} onClick={() => void pedirPropuesta()}>
            Proponer retoques ({sinPropuesta})
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}

        {/* Lo que hay, en una línea. El asesor abre una foto porque algo de
            este resumen le llamó la atención, no al revés. */}
        <p className="text-sm text-muted-foreground">
          {estadoRevelado.data && (
            <>
              {reveladas === 0
                ? 'Ninguna foto se ha revelado todavía. '
                : `${reveladas} de ${images.length} ${reveladas === 1 ? 'foto revelada' : 'fotos reveladas'}. `}
              {estadoRevelado.data.auto
                ? 'El revelado se aplica solo al subir, y se puede deshacer foto a foto. '
                : 'El revelado no se aplica solo en este servidor. '}
            </>
          )}
          {conVisita > 0 && (
            <>
              <strong className="font-medium text-foreground">
                {conVisita === 1
                  ? 'Una foto pide volver a la casa'
                  : `${conVisita} fotos piden volver a la casa`}
              </strong>
              : eso no lo arregla ningún programa.{' '}
            </>
          )}
          Pulsa una foto para ver el antes y el después y lo que se le propone.
        </p>

        {retocadas > 0 && (
          /* Se dice arriba y no solo en cada tarjeta: mirando foto a foto no se
             ve cuántas de las que están publicadas son generadas, y ese número
             es el que importa cuando un comprador llega a la casa. */
          <Alert tone="warn">
            {retocadas === 1
              ? 'Una de las fotos publicadas de este inmueble está retocada con IA.'
              : `${retocadas} de las fotos publicadas de este inmueble están retocadas con IA.`}{' '}
            Quien vea la ficha está viendo píxeles generados: comprueba que la casa se
            parece a lo que se enseña.
          </Alert>
        )}

        <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5 p-0">
          {images.map((image, indice) => (
            <TileRetoque
              key={image.id}
              image={image}
              indice={indice}
              revelado={porRevelado.get(image.id) ?? null}
              propuesta={porPropuesta.get(image.id) ?? null}
              onAbrir={() => setAbierta(image.id)}
            />
          ))}
        </ul>
      </div>

      {foto && (
        <FichaFoto
          propertyId={propertyId}
          image={foto}
          posicion={images.findIndex((i) => i.id === foto.id) + 1}
          total={images.length}
          revelado={porRevelado.get(foto.id) ?? null}
          propuesta={porPropuesta.get(foto.id) ?? null}
          estadoRetoque={estadoRetoque.data?.enabled ? estadoRetoque.data : null}
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
 * Solo tres distintivos, y ninguno es decorativo: si está retocada con IA
 * (porque eso cambia lo que ve un comprador), si pide una visita (porque eso
 * cuesta un desplazamiento) y cuántos arreglos automáticos le quedan (porque
 * eso es un botón). Todo lo demás cabe dentro.
 */
function TileRetoque({
  image,
  indice,
  revelado,
  propuesta,
  onAbrir,
}: {
  image: MediaImage;
  indice: number;
  revelado: ReveladoImagen | null;
  propuesta: PropuestaImagen | null;
  onAbrir: () => void;
}) {
  const partida = propuesta ? partir(propuesta.sugerencias) : null;
  const revisita = (partida?.revisita.length ?? 0) > 0;
  const autos = partida?.auto.length ?? 0;
  const revelada = revelado?.estado === 'HECHO';

  return (
    <li
      className={cn(
        'relative aspect-[4/3] overflow-hidden rounded-md border bg-secondary',
        revisita && 'border-amber-300',
        image.aiEdited && 'border-amber-400',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver el revelado y la propuesta de la foto ${indice + 1}`}
        className="block size-full cursor-zoom-in"
      >
        {/* Siempre la miniatura de 560 px, también la revelada: en un tile de
            128 px el original no aporta un píxel visible y sí varios megas. */}
        <img
          src={revelada ? revelado.thumbDespues : image.url}
          alt={image.description ?? `Foto ${indice + 1}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </button>

      {/* Todo lo que va encima de la foto es `pointer-events-none`: son
          rotulos, y la foto entera tiene que seguir siendo el boton que abre la
          ficha. Sin esto, pulsar sobre la banda de abajo —que es justo donde
          cae el pulgar en un movil— no hacia nada. */}
      <span className="tabular pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
        {indice + 1}
      </span>

      <span className="pointer-events-none absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
        {image.aiEdited && (
          <Badge tone="amber">
            <Wand2 className="size-3" aria-hidden /> IA
          </Badge>
        )}
        {revisita && (
          <Badge tone="amber">
            <Camera className="size-3" aria-hidden /> Visita
          </Badge>
        )}
      </span>

      {(autos > 0 || revelado?.estado === 'FALLIDO') && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[0.625rem] font-medium text-white">
          {revelado?.estado === 'FALLIDO' ? (
            <>
              <ImageOff className="size-3" aria-hidden /> No se pudo revelar
            </>
          ) : (
            <>
              <SlidersHorizontal className="size-3" aria-hidden />
              {/* «1 arreglo» y no «1 arreglo automático»: en un tile de 128 px
                  la frase larga parte en dos líneas y se come la foto. Que son
                  automáticos ya lo dice el bloque al abrirla. */}
              {autos === 1 ? '1 arreglo' : `${autos} arreglos`}
            </>
          )}
        </span>
      )}
    </li>
  );
}
