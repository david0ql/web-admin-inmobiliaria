import { useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Ruler,
  Star,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogTitle } from '@/components/ui';
import type { MediaImage } from '@/lib/api';

/**
 * El visor a tamaño grande.
 *
 * Existe para que la rejilla pueda seguir siendo de miniaturas: en el panel se
 * mira una foto cuando se duda si vale, y esa es la única vez que hace falta
 * pedir la versión de 1600 px. Nunca se carga el original —hay fotos de varios
 * megas y aquí no se está editando ninguna, se está decidiendo si se publica—.
 *
 * Y es donde viven las acciones sobre la imagen. En un móvil no hay «pasar el
 * ratón», y la barra de la miniatura solo puede llevar las flechas sin tapar la
 * foto; aquí hay sitio para que cada botón lleve su nombre escrito, que es
 * mejor que cinco iconos de 28 px en cualquier pantalla.
 */
export function Visor({
  images,
  index,
  onIndex,
  onClose,
  editable,
  onPortada,
  onTipo,
  onBorrar,
  ocupado,
}: {
  images: MediaImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  editable: boolean;
  onPortada: () => void;
  onTipo: () => void;
  onBorrar: () => void;
  ocupado: boolean;
}) {
  const image = images[index];

  // Las flechas del teclado son como se pasa una galería; Radix ya cierra con
  // Escape, así que eso no se toca.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' && index < images.length - 1) onIndex(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndex]);

  if (!image) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-5xl gap-3 p-4">
        <DialogTitle className="flex flex-wrap items-center gap-2 pr-10 text-sm font-medium">
          {image.kind === 'FLOOR_PLAN' ? 'Plano' : 'Foto'} {index + 1} de {images.length}
          {image.width && image.height ? (
            <span className="tabular font-normal text-muted-foreground">
              {image.width} × {image.height} px
            </span>
          ) : null}
          {image.isMain && <Badge tone="ink">Portada</Badge>}
          {/* A tamano grande es donde alguien decide si esta foto vale para el
              portal, y por tanto donde mas falta hace saber que lo que esta
              mirando lo genero un modelo. */}
          {image.retouchId && (
            <Badge tone="amber">
              <Wand2 className="size-3" aria-hidden /> Retocada con IA
            </Badge>
          )}
        </DialogTitle>

        <div className="relative flex items-center justify-center rounded-md bg-secondary">
          {/* Un plano se lee sobre blanco: sobre el gris del panel las líneas
              finas y las cotas se pierden. */}
          <img
            src={image.urlLarge ?? image.url}
            alt={image.description ?? `Imagen ${index + 1}`}
            /*
              Más baja en el móvil. A 70dvh la foto empujaba los botones fuera
              del alto de la pantalla, y como en táctil el visor ES el sitio
              desde donde se hace portada o se borra, quedaban sin alcance.
            */
            className={`max-h-[52dvh] w-auto max-w-full rounded-md object-contain sm:max-h-[70dvh] ${
              image.kind === 'FLOOR_PLAN' ? 'bg-white' : ''
            }`}
          />

          {index > 0 && (
            <Flecha lado="izquierda" onClick={() => onIndex(index - 1)} />
          )}
          {index < images.length - 1 && (
            <Flecha lado="derecha" onClick={() => onIndex(index + 1)} />
          )}
        </div>

        {image.description && (
          <p className="text-sm text-muted-foreground">{image.description}</p>
        )}

        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado || image.isMain}
              onClick={onPortada}
            >
              <Star className={image.isMain ? 'fill-current' : undefined} />
              {image.isMain ? 'Ya es la portada' : 'Hacer portada'}
            </Button>
            <Button variant="outline" size="sm" disabled={ocupado} onClick={onTipo}>
              {image.kind === 'FLOOR_PLAN' ? <ImageIcon /> : <Ruler />}
              {image.kind === 'FLOOR_PLAN' ? 'Es una foto, no un plano' : 'Marcar como plano'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={onBorrar}
              className="text-destructive"
            >
              <Trash2 />
              Borrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Flecha({ lado, onClick }: { lado: 'izquierda' | 'derecha'; onClick: () => void }) {
  const izquierda = lado === 'izquierda';
  return (
    <button
      type="button"
      aria-label={izquierda ? 'Foto anterior' : 'Foto siguiente'}
      onClick={onClick}
      className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow-sm transition-colors hover:bg-background ${
        izquierda ? 'left-2' : 'right-2'
      }`}
    >
      {izquierda ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}
