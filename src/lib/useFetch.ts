import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Carga de datos con cancelacion.
 *
 * `deps` decide cuando recargar. La peticion anterior se aborta al cambiar los
 * filtros: sin eso, teclear en el buscador dispara una carrera y a veces gana
 * la respuesta vieja.
 */
export function useFetch<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    loadRef
      .current(controller.signal)
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!alive || controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          data: null,
          loading: false,
          error:
            error instanceof ApiError
              ? error.message
              : 'No se pudo cargar la información. Revisa la conexión con la API.',
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Debounce para el buscador: una peticion por pausa, no por tecla. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
