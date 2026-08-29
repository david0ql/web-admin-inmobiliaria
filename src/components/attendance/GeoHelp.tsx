import { AlertTriangle, MapPinOff, RotateCw, SatelliteDish } from 'lucide-react';
import { Button } from '../ui';
import type { GeoFailure } from './useGeolocation';

/**
 * Que hacer cuando el navegador no da la ubicacion.
 *
 * El caso importante es el permiso denegado: una vez dicho que no, el dialogo
 * no vuelve a salir por mucho que se pulse el boton, asi que la unica salida es
 * ir a los ajustes del sitio. Las instrucciones son distintas en el computador
 * y en el celular, y se muestran las dos porque la deteccion por `userAgent`
 * acierta casi siempre pero no siempre; lo que hace la deteccion es poner
 * delante la que toca.
 */
type Platform = 'android' | 'ios' | 'desktop';

function platform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // El iPad se anuncia como Mac desde iPadOS 13; el soporte tactil lo delata.
  if (/iphone|ipod|ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  return 'desktop';
}

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="micro-label mb-1.5">{title}</p>
      <ol className="list-decimal space-y-1 pl-4 text-sm">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

const DESKTOP = [
  'Toca el candado (o el ícono que hay a la izquierda de la dirección web) en la barra del navegador.',
  'Busca «Ubicación» y cámbiala a «Permitir».',
  'Recarga la página y vuelve a marcar.',
];

const ANDROID = [
  'Toca el candado junto a la dirección web y entra en «Permisos» o «Configuración del sitio».',
  'Cambia «Ubicación» a «Permitir» y recarga la página.',
  'Si sigue igual, revisa que la ubicación del celular esté encendida en los ajustes del sistema.',
];

const IPHONE = [
  'Toca «AA» a la izquierda de la dirección → «Configuración del sitio web» → «Ubicación» → «Permitir».',
  'Si no aparece, entra en Ajustes → Privacidad y seguridad → Localización → Safari y elige «Al usar la app».',
  'Vuelve a la página, recárgala y marca otra vez.',
];

export function GeoHelp({
  failure,
  onRetry,
  retrying,
}: {
  failure: GeoFailure;
  onRetry: () => void;
  retrying: boolean;
}) {
  const blocked = failure.kind === 'denied';

  /*
    Se enseñan las instrucciones del aparato que se esta usando y, detras, las
    del otro sitio desde el que la gente ficha. Las tres a la vez son una pared
    de texto en una pantalla de telefono, y la persona esta mirando el telefono
    justo en ese momento.
  */
  const guides = {
    android: [
      { title: 'En Android', steps: ANDROID },
      { title: 'En el computador', steps: DESKTOP },
    ],
    ios: [
      { title: 'En iPhone', steps: IPHONE },
      { title: 'En el computador', steps: DESKTOP },
    ],
    desktop: [
      { title: 'En el computador', steps: DESKTOP },
      { title: 'En Android', steps: ANDROID },
      { title: 'En iPhone', steps: IPHONE },
    ],
  }[platform()];

  return (
    <div
      role="alert"
      className={
        blocked || failure.kind === 'insecure' || failure.kind === 'unsupported'
          ? 'rounded-md border border-red-200 bg-red-50 p-4 text-red-900'
          : 'rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900'
      }
    >
      <div className="flex items-start gap-2.5">
        {blocked ? (
          <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : failure.kind === 'timeout' ? (
          <SatelliteDish className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {blocked ? 'Sin ubicación no se puede marcar' : failure.message}
          </p>
          {blocked && (
            <p className="mt-0.5 text-sm">
              La entrada y la salida quedan registradas con tus coordenadas, así que el
              navegador tiene que dártelas. Como ya le dijiste que no, no volverá a
              preguntar: hay que desbloquearlo a mano.
            </p>
          )}
          {failure.kind === 'timeout' && (
            <p className="mt-0.5 text-sm">
              Acércate a una ventana o sal un momento y vuelve a intentarlo.
            </p>
          )}

          {blocked && (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:gap-6">
              {guides.map((block) => (
                <Steps key={block.title} title={block.title} steps={block.steps} />
              ))}
            </div>
          )}

          {/* Reintentar solo donde puede servir de algo: con el permiso
              denegado el navegador responde que no sin preguntar, y ofrecer un
              boton que siempre falla es peor que no ofrecerlo. */}
          {(failure.kind === 'timeout' || failure.kind === 'unavailable') && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 bg-white"
              onClick={onRetry}
              loading={retrying}
            >
              <RotateCw aria-hidden />
              Reintentar
            </Button>
          )}
          {blocked && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 bg-white"
              onClick={() => window.location.reload()}
            >
              <RotateCw aria-hidden />
              Ya lo permití, recargar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
