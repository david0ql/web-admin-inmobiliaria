import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, branchScope, seesAllBranches, type Branch } from './api';
import { useAuth } from './auth';

/**
 * La sede sobre la que trabaja el panel.
 *
 * La eleccion vive en `lib/api.ts` —es quien pone la cabecera `x-branch`— y
 * aqui solo se envuelve para React: la lista de sedes visibles, cual esta
 * puesta y el cambio.
 *
 * `GET /branches` ya devuelve lo que a cada uno le toca: a quien las ve todas,
 * todas; a los demas, la suya y nada mas. Asi que el panel no decide nada de
 * permisos, solo pinta lo que la API le deja ver.
 */
interface BranchValue {
  /** Las sedes que esta persona puede ver. */
  branches: Branch[];
  loading: boolean;
  /** La puesta ahora mismo; `null` es "todas las sedes". */
  branchId: string | null;
  current: Branch | null;
  /** Si puede elegir: solo entonces el selector tiene sentido. */
  seesAll: boolean;
  setBranchId: (id: string | null) => void;
  reload: () => void;
}

const BranchContext = createContext<BranchValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [branchId, setBranchIdState] = useState<string | null>(
    () => branchScope.current,
  );

  const seesAll = seesAllBranches(user?.role);

  const apply = useCallback((id: string | null) => {
    branchScope.set(id);
    setBranchIdState(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setBranches([]);
      return;
    }

    let alive = true;
    setLoading(true);
    api
      .get<Branch[]>('/branches')
      .then((list) => {
        if (!alive) return;
        setBranches(list);

        // Dos reconciliaciones que evitan trabajar sobre una sede fantasma:
        // quien no puede elegir no manda cabecera nunca, y una sede guardada
        // que ya no exista —o que sea de otro usuario del mismo navegador—
        // vuelve a "todas".
        if (!seesAllBranches(user.role)) {
          if (branchScope.current) apply(null);
        } else {
          const guardada = branchScope.current;
          if (guardada && !list.some((b) => b.id === guardada)) apply(null);
        }
      })
      .catch(() => {
        if (alive) setBranches([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user, nonce, apply]);

  const value = useMemo<BranchValue>(() => {
    const current =
      branches.find((b) => b.id === branchId) ??
      // Quien pertenece a una sede no tiene `branchId` puesto —no manda
      // cabecera— pero su sede es la unica que la API le devuelve.
      (!seesAll && branches.length === 1 ? branches[0] : null);

    return {
      branches,
      loading,
      branchId,
      current,
      seesAll,
      setBranchId: apply,
      reload: () => setNonce((n) => n + 1),
    };
  }, [branches, loading, branchId, seesAll, apply]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch debe usarse dentro de <BranchProvider>');
  return ctx;
}
