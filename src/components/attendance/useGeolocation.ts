import { useCallback, useEffect, useState } from 'react';

/**
 * La ubicacion del navegador, con los fallos separados por causa.
 *
 * Un unico "no se pudo obtener la ubicacion" deja a la persona atascada, porque
 * los tres motivos se arreglan de forma distinta: el permiso denegado se
 * arregla en los ajustes del sitio —y NO se puede volver a pedir por codigo,
 * el navegador ya no muestra el dialogo—, la falta de senal se arregla saliendo
 * al balcon, y el tiempo agotado normalmente se arregla solo al reintentar.
 * Por eso el error viaja con `kind` y cada uno tiene su texto y su salida.
 */
export type GeoFailureKind = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export interface GeoFix {
  latitude: number;
  longitude: number;
  /** Radio en metros que el navegador se atreve a garantizar. */
  accuracy: number | null;
}

export class GeoFailure extends Error {
  readonly kind: GeoFailureKind;

  constructor(kind: GeoFailureKind, message: string) {
    super(message);
    this.name = 'GeoFailure';
    this.kind = kind;
  }
}

function positionOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function translate(error: unknown): GeoFailure {
  const code = (error as GeolocationPositionError | undefined)?.code;
  if (code === 1) {
    return new GeoFailure('denied', 'El navegador tiene bloqueada la ubicación para este sitio.');
  }
  if (code === 3) {
    return new GeoFailure(
      'timeout',
      'Se agotó el tiempo esperando la señal. Dentro de un edificio es normal.',
    );
  }
  return new GeoFailure(
    'unavailable',
    'El dispositivo no pudo calcular la posición. Revisa que la ubicación del equipo esté encendida.',
  );
}

/**
 * Pide la posicion. Dos intentos con criterios distintos a proposito:
 *
 * el primero exige GPS fino, que es lo que queremos para una marca de
 * asistencia; si se agota el tiempo —lo habitual en una oficina con losa
 * encima— el segundo se conforma con la posicion por red, que llega en
 * segundos y es peor pero existe. Marcar con 300 metros de error es
 * infinitamente mejor que no poder marcar.
 */
async function locate(): Promise<GeoFix> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GeoFailure('unsupported', 'Este navegador no sabe dar la ubicación.');
  }
  // Sin HTTPS el navegador ni lo intenta, y el error que devuelve es el mismo
  // que el de "no hay senal": conviene decir la verdad.
  if (!window.isSecureContext) {
    throw new GeoFailure(
      'insecure',
      'La página no está abierta por una conexión segura (https) y el navegador no entrega la ubicación.',
    );
  }

  try {
    const fine = await positionOnce({
      enableHighAccuracy: true,
      timeout: 12_000,
      // Una posicion de hace medio minuto sigue siendo donde estas; pedirla de
      // cero en cada marca solo anade espera.
      maximumAge: 30_000,
    });
    return toFix(fine);
  } catch (error) {
    const failure = translate(error);
    if (failure.kind !== 'timeout') throw failure;

    try {
      const coarse = await positionOnce({
        enableHighAccuracy: false,
        timeout: 20_000,
        maximumAge: 60_000,
      });
      return toFix(coarse);
    } catch (second) {
      throw translate(second);
    }
  }
}

function toFix(position: GeolocationPosition): GeoFix {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

export function useGeolocation() {
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<GeoFailure | null>(null);
  const [fix, setFix] = useState<GeoFix | null>(null);
  /** Lo que el navegador ya tiene decidido, sin abrir ningun dialogo. */
  const [permission, setPermission] = useState<PermissionState | null>(null);

  /*
    Consultar el estado del permiso NO lo pide: no sale ventana ninguna. Sirve
    para avisar de que esta bloqueado antes de que la persona pulse el boton y
    se lleve un fallo silencioso —el dialogo ya no aparece nunca mas—.
    `permissions` no existe en Safari antiguo; ahi simplemente no se avisa.
  */
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => setPermission(status?.state ?? null);

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        status = result;
        setPermission(result.state);
        result.addEventListener('change', onChange);
      })
      .catch(() => {
        /* Navegador sin soporte: se sigue sin aviso previo. */
      });

    return () => status?.removeEventListener('change', onChange);
  }, []);

  const request = useCallback(async (): Promise<GeoFix> => {
    setLocating(true);
    setFailure(null);
    try {
      const result = await locate();
      setFix(result);
      return result;
    } catch (error) {
      const failed = error instanceof GeoFailure ? error : translate(error);
      setFailure(failed);
      throw failed;
    } finally {
      setLocating(false);
    }
  }, []);

  return { request, locating, failure, fix, permission };
}
