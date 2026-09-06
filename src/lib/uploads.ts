import { useCallback, useEffect, useRef, useState } from 'react';
import { branchScope, refreshSession, tokens } from './api';

/**
 * Cola de subida de fotos.
 *
 * No usa `upload()` de `lib/api.ts` por dos razones que en esta oficina se
 * notan: `fetch` no informa de cuanto lleva subido —solo se sabe cuando
 * termina— y con veinte fotos desde un internet regular eso es una barra
 * parada durante minutos. `XMLHttpRequest` si emite progreso de subida, y es
 * la unica forma de tenerlo hoy en el navegador.
 *
 * La segunda razon es el aislamiento. Mandar las veinte en una sola peticion
 * significa que una foto vertical o de poca resolucion tumba el envio entero, o
 * que hay que adivinar cual de las veinte fallo. Aqui va UNA foto por peticion:
 * el error tiene nombre y apellidos, se enseña el motivo que escribio el
 * servidor tal cual, y las diecinueve buenas quedan guardadas.
 */

export type UploadState = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  /** `objectURL` del fichero elegido: la miniatura se ve antes de subir. */
  preview: string;
  /** 0–100. Es progreso de subida, no de procesado en el servidor. */
  progress: number;
  state: UploadState;
  /** El motivo tal cual lo manda la API, para saber que hacer con esa foto. */
  reason: string | null;
  /**
   * Si tiene sentido volver a intentarlo.
   *
   * Un corte de red si; un PDF renombrado a `.jpg` no —volver a mandarlo daria
   * exactamente el mismo error— y ofrecer el boton seria mentir.
   */
  retriable: boolean;
}

/** Lo que el navegador acepta poner en un `<input type="file">` de imagenes. */
export const ACCEPT_IMAGENES = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

/**
 * Tope de cortesia, del lado del navegador.
 *
 * No sustituye al del servidor —ese manda— pero evita gastar cinco minutos de
 * subida para que al final la rechacen. Una foto de camara ronda 5–12 MB.
 */
const MAX_BYTES = 40 * 1024 * 1024;

interface Respuesta {
  status: number;
  text: string;
}

/**
 * Una peticion con progreso. Devuelve siempre el cuerpo, tambien en los
 * errores: ahi es donde viene escrito el motivo del rechazo.
 */
function enviar(
  path: string,
  field: string,
  file: File,
  campos: Record<string, string>,
  onProgress: (percent: number) => void,
  registrar: (xhr: XMLHttpRequest) => void,
): Promise<Respuesta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registrar(xhr);

    const body = new FormData();
    body.append(field, file);
    // `kind` viaja en el mismo multipart: quien arrastra tres planos al
    // recuadro de planos no tiene que marcarlos uno a uno despues.
    for (const [clave, valor] of Object.entries(campos)) body.append(clave, valor);

    xhr.open('POST', `/api/v1${path}`);
    const access = tokens.access;
    if (access) xhr.setRequestHeader('Authorization', `Bearer ${access}`);
    // La misma cabecera de sede que lleva cualquier otra peticion del panel.
    const branch = branchScope.current;
    if (branch) xhr.setRequestHeader('x-branch', branch);
    // El `Content-Type` lo escribe el navegador: lleva dentro el `boundary`.

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      /*
        Se topa en 99. El 100 % de bytes enviados no es la foto guardada: el
        servidor todavia tiene que recomprimirla en cuatro tamaños, y una barra
        llena junto a un tile que sigue girando se lee como que se colgo.
      */
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () =>
      reject(new Error('Se cortó la conexión mientras subía. Vuelve a intentarlo.'));
    xhr.onabort = () => reject(new Error('Subida cancelada.'));
    xhr.ontimeout = () => reject(new Error('El servidor tardó demasiado en responder.'));
    xhr.send(body);
  });
}

function parsear(text: string): Record<string, unknown> | null {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * El desglose por fichero, cuando la API lo manda.
 *
 * Como va una foto por peticion, si hay algo en `rejected` es la nuestra.
 */
function rechazo(body: Record<string, unknown> | null): string | null {
  const lista = body?.rejected;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const primero = lista[0] as { reason?: unknown };
  return typeof primero?.reason === 'string' ? primero.reason : null;
}

/*
  La API compone este texto cuando ninguna de las fotos del envio se pudo
  guardar. Mandando una sola, el prefijo y el nombre del fichero ya los sabe
  quien mira la pantalla —la foto esta ahi, con su nombre debajo— asi que
  sobran: lo que hace falta leer es el motivo.
*/
const SIN_GUARDAR = /^Ninguna imagen se pudo guardar\.\s*/;

function limpiar(mensaje: string, nombre: string): string {
  const sinPrefijo = mensaje.replace(SIN_GUARDAR, '').trim();
  return sinPrefijo.startsWith(`${nombre}:`)
    ? sinPrefijo.slice(nombre.length + 1).trim()
    : sinPrefijo;
}

/** El motivo del fallo, priorizando siempre lo que escribio el servidor. */
function motivo(status: number, text: string, nombre: string): string {
  const body = parsear(text);

  const desglose = rechazo(body);
  if (desglose) return desglose;

  const mensaje = body?.message;
  const texto = Array.isArray(mensaje)
    ? mensaje.filter((m): m is string => typeof m === 'string').join('. ')
    : typeof mensaje === 'string'
      ? mensaje
      : '';
  if (texto) return limpiar(texto, nombre);

  // Sin cuerpo util, lo unico honesto es decir que respondio el servidor.
  if (status === 413) return 'La foto pesa más de lo que admite el servidor.';
  if (status === 401 || status === 403) return 'No tienes permiso para subir fotos aquí.';
  if (status === 0) return 'No se pudo contactar con el servidor.';
  return `El servidor respondió ${status} y no explicó el motivo.`;
}

async function subirUna(
  path: string,
  field: string,
  file: File,
  campos: Record<string, string>,
  onProgress: (percent: number) => void,
  registrar: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  let res = await enviar(path, field, file, campos, onProgress, registrar);

  // El access token dura quince minutos y subir veinte fotos se pasa de ahi.
  if (res.status === 401 && (await refreshSession())) {
    res = await enviar(path, field, file, campos, onProgress, registrar);
  }

  if (res.status >= 200 && res.status < 300) {
    /*
      Un 2xx no garantiza que la foto entrara: la API puede aceptar el envio y
      devolver aparte lo que descarto —resolucion, orientacion—. Si nuestra
      unica foto esta en esa lista, esto es un fallo por mucho que el codigo
      sea 200.
    */
    const descartada = rechazo(parsear(res.text));
    if (descartada) throw new Error(descartada);
    return;
  }

  throw new Error(motivo(res.status, res.text, file.name));
}

/**
 * La cola.
 *
 * Sube de una en una, no en paralelo, y es a proposito: la API coloca cada foto
 * al final contando las que ya hay, asi que dos peticiones a la vez se pisan la
 * posicion y el orden sale mezclado. Ademas, en una linea regular el tiempo
 * total es el mismo y de una en una el progreso que se ve es el de verdad.
 */
export function useImageUploads({
  path,
  field = 'files',
  campos,
  onSettled,
}: {
  /** Ruta de la API, sin `/api/v1`. Por ejemplo `/properties/<id>/images`. */
  path: string;
  field?: string;
  /** Campos de texto que acompanan al fichero; hoy solo `kind`. */
  campos?: Record<string, string>;
  /** Se llama una vez cuando la cola se vacia, si algo se subio. */
  onSettled: () => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const ficheros = useRef(new Map<string, File>());
  const cola = useRef<string[]>([]);
  const bombeando = useRef(false);
  const enVuelo = useRef<XMLHttpRequest | null>(null);
  const montado = useRef(true);

  // Las dos cambian de identidad en cada render; la cola necesita la ultima.
  const pathRef = useRef(path);
  pathRef.current = path;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const camposRef = useRef(campos);
  camposRef.current = campos;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      // Salir de la pantalla corta la subida en curso: seguir con ella dejaria
      // peticiones vivas contra una ficha que ya nadie mira.
      enVuelo.current?.abort();
      for (const item of ficheros.current.keys()) ficheros.current.delete(item);
    };
  }, []);

  const actualizar = useCallback((id: string, cambios: Partial<UploadItem>) => {
    if (!montado.current) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...cambios } : item)),
    );
  }, []);

  const bombear = useCallback(async () => {
    if (bombeando.current) return;
    bombeando.current = true;
    let subidas = 0;

    while (cola.current.length && montado.current) {
      const id = cola.current.shift() as string;
      const file = ficheros.current.get(id);
      if (!file) continue;

      actualizar(id, { state: 'uploading', progress: 0, reason: null });
      try {
        await subirUna(
          pathRef.current,
          field,
          file,
          camposRef.current ?? {},
          (percent) => actualizar(id, { progress: percent }),
          (xhr) => (enVuelo.current = xhr),
        );
        subidas += 1;
        actualizar(id, { state: 'done', progress: 100, reason: null });
        // El fichero ya no hace falta: son megas retenidos en memoria.
        ficheros.current.delete(id);
      } catch (error) {
        actualizar(id, {
          state: 'error',
          reason: error instanceof Error ? error.message : 'No se pudo subir la foto.',
        });
      } finally {
        enVuelo.current = null;
      }
    }

    bombeando.current = false;
    // Una sola recarga al final: con veinte fotos, recargar por cada una serian
    // veinte peticiones de la ficha entera contra la misma conexion que sube.
    if (subidas && montado.current) settledRef.current();
  }, [actualizar, field]);

  const add = useCallback(
    (entrada: FileList | File[] | null) => {
      const files = entrada ? Array.from(entrada) : [];
      if (!files.length) return;

      const nuevos: UploadItem[] = files.map((file) => {
        const id = crypto.randomUUID();
        const item: UploadItem = {
          id,
          name: file.name,
          size: file.size,
          preview: URL.createObjectURL(file),
          progress: 0,
          state: 'pending',
          reason: null,
          retriable: true,
        };

        /*
          Lo que el navegador ya sabe que va a fallar no se manda: gastar cinco
          minutos de subida para recibir un rechazo previsible es justo lo que
          no puede pasar con esta conexion.
        */
        if (!TIPOS.has(file.type)) {
          item.state = 'error';
          item.retriable = false;
          item.reason = file.type
            ? `«${file.type}» no es una imagen que se pueda publicar. Usa JPG, PNG o WebP.`
            : 'No parece una imagen. Usa JPG, PNG o WebP.';
        } else if (file.size > MAX_BYTES) {
          item.state = 'error';
          item.retriable = false;
          item.reason = `Pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el tope son 40 MB.`;
        } else {
          ficheros.current.set(id, file);
          cola.current.push(id);
        }
        return item;
      });

      setItems((prev) => [...prev, ...nuevos]);
      void bombear();
    },
    [bombear],
  );

  /** Reintenta una que fallo: la conexion regular corta subidas a media. */
  const retry = useCallback(
    (id: string) => {
      if (!ficheros.current.has(id)) return;
      actualizar(id, { state: 'pending', progress: 0, reason: null });
      cola.current.push(id);
      void bombear();
    },
    [actualizar, bombear],
  );

  /** Quita un tile de la lista. El objectURL se suelta aqui. */
  const dismiss = useCallback((id: string) => {
    ficheros.current.delete(id);
    cola.current = cola.current.filter((pendiente) => pendiente !== id);
    setItems((prev) => {
      const item = prev.find((candidato) => candidato.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((candidato) => candidato.id !== id);
    });
  }, []);

  /**
   * Las que ya estan guardadas dejan de pintarse como tiles de subida: la foto
   * de verdad ya llego en la recarga y si no, se verian dos veces.
   */
  const clearDone = useCallback(() => {
    setItems((prev) => {
      for (const item of prev) {
        if (item.state === 'done') URL.revokeObjectURL(item.preview);
      }
      return prev.filter((item) => item.state !== 'done');
    });
  }, []);

  const subiendo = items.some(
    (item) => item.state === 'pending' || item.state === 'uploading',
  );
  const fallidas = items.filter((item) => item.state === 'error');

  return { items, add, retry, dismiss, clearDone, subiendo, fallidas };
}
