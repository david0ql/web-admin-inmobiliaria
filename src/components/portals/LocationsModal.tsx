import { useState } from 'react';
import { Check, Search, Wand2 } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { number } from '../../lib/format';
import type { LocationMapping, LocationsOverview, PortalConnection, RemoteLocation } from '../../lib/portals';
import { Alert, Badge, Button, ErrorNote, Input, Loading, Modal, Table, TBody, Td, Th, THead, Tr } from '../ui';

interface Target {
  cityId: number;
  cityName: string;
  zoneId: number | null;
  label: string;
}

/**
 * Equivalencias entre nuestras ciudades y zonas (las de WASI) y las del
 * portal. Sin barrio emparejado, Fincaraiz no acepta el aviso.
 *
 * Primero las ciudades —el portal busca los barrios dentro de ellas— y
 * despues las zonas, ordenadas por cuantos inmuebles activos tienen: con unas
 * decenas se cubre casi todo el inventario.
 */
export function LocationsModal({
  connection,
  onClose,
}: {
  connection: PortalConnection;
  onClose: () => void;
}) {
  const base = `/publishing/connections/${connection.portalId}/locations`;
  const { data, error, loading, reload } = useFetch<LocationsOverview>(
    (signal) => api.get<LocationsOverview>(base, undefined, signal),
    [base],
  );
  const [target, setTarget] = useState<Target | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [auto, setAuto] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });

  async function autoMatch() {
    setAuto({ busy: true, message: null });
    try {
      const r = await api.post<{ tried: number; matched: number; remaining: number }>(`${base}/auto`);
      setAuto({
        busy: false,
        message: `Se probaron ${r.tried} y se emparejaron ${r.matched}.${r.remaining ? ` Quedan ${r.remaining}: vuelve a pulsar.` : ''} Revisa las marcadas "sin verificar".`,
      });
    } catch (err) {
      setAuto({ busy: false, message: err instanceof ApiError ? err.message : 'No se pudo emparejar.' });
    }
    reload();
  }

  const cities = data?.cities ?? [];
  const zones = (data?.zones ?? []).filter((z) => !onlyMissing || !z.mapping || !z.mapping.verified);
  const covered = (data?.zones ?? []).filter((z) => z.mapping).reduce((n, z) => n + z.properties, 0);
  const total = (data?.zones ?? []).reduce((n, z) => n + z.properties, 0);

  return (
    <Modal title={`Barrios en ${connection.portal.name}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={auto.busy} onClick={() => void autoMatch()}>
            <Wand2 className="size-3.5" /> Emparejar automaticamente
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Solo lo pendiente
          </label>
          {data && (
            <span className="ml-auto text-sm text-muted-foreground">
              {number(covered)} de {number(total)} inmuebles con barrio emparejado
            </span>
          )}
        </div>
        {auto.message && <Alert>{auto.message}</Alert>}
        {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
        {loading && !data && <Loading rows={6} />}

        {target && (
          <Picker
            base={base}
            target={target}
            onCancel={() => setTarget(null)}
            onPicked={() => {
              setTarget(null);
              reload();
            }}
          />
        )}

        {data && (
          <>
            <Section title="Ciudades">
              {cities.map((c) => (
                <MappingRow
                  key={`c${c.cityId}`}
                  name={c.cityName}
                  count={c.properties}
                  mapping={c.mapping}
                  onPick={() => setTarget({ cityId: c.cityId, cityName: c.cityName, zoneId: null, label: c.cityName })}
                />
              ))}
            </Section>
            <Section title="Zonas / barrios">
              {zones.map((z) => (
                <MappingRow
                  key={`z${z.zoneId}`}
                  name={`${z.zoneName} · ${z.cityName}`}
                  count={z.properties}
                  mapping={z.mapping}
                  onPick={() =>
                    setTarget({ cityId: z.cityId, cityName: z.cityName, zoneId: z.zoneId, label: z.zoneName })
                  }
                />
              ))}
            </Section>
          </>
        )}
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Table>
      <THead>
        <tr>
          <Th>{title}</Th>
          <Th className="w-[1%] whitespace-nowrap">Inmuebles</Th>
          <Th>En el portal</Th>
          <Th className="w-[1%]" />
        </tr>
      </THead>
      <TBody>{children}</TBody>
    </Table>
  );
}

function MappingRow({
  name,
  count,
  mapping,
  onPick,
}: {
  name: string;
  count: number;
  mapping: LocationMapping | null;
  onPick: () => void;
}) {
  return (
    <Tr>
      <Td>{name}</Td>
      <Td className="tabular text-right">{number(count)}</Td>
      <Td>
        {mapping ? (
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            {mapping.externalName}
            {!mapping.verified && <Badge tone="amber">sin verificar</Badge>}
          </span>
        ) : (
          <Badge tone="red">Sin emparejar</Badge>
        )}
      </Td>
      <Td>
        <Button size="sm" variant="outline" onClick={onPick}>
          {mapping ? 'Cambiar' : 'Elegir'}
        </Button>
      </Td>
    </Tr>
  );
}

function Picker({
  base,
  target,
  onCancel,
  onPicked,
}: {
  base: string;
  target: Target;
  onCancel: () => void;
  onPicked: () => void;
}) {
  const [q, setQ] = useState(target.label);
  const [results, setResults] = useState<RemoteLocation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      setResults(
        await api.get<RemoteLocation[]>(`${base}/search`, {
          q,
          // Una zona se busca dentro de su ciudad; una ciudad, en todo el portal.
          ...(target.zoneId ? { cityId: target.cityId } : {}),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo buscar.');
    } finally {
      setBusy(false);
    }
  }

  async function pick(r: RemoteLocation) {
    setBusy(true);
    setError(null);
    try {
      await api.put(base, {
        cityId: target.cityId,
        zoneId: target.zoneId,
        externalId: r.id,
        externalName: [r.name, r.city, r.state].filter(Boolean).join(', '),
        extra: r.extra ?? {},
      });
      onPicked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-secondary/40 p-3">
      <p className="text-sm">
        Buscar en el portal el equivalente de <strong>{target.label}</strong>
        {target.zoneId ? ` (${target.cityName})` : ''}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <Button type="submit" loading={busy}>
          <Search className="size-3.5" /> Buscar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {results && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin resultados. Prueba con otra forma del nombre (sin tildes, sin "barrio"...).
        </p>
      )}
      {results?.map((r) => (
        <button
          key={r.id}
          type="button"
          disabled={busy}
          onClick={() => void pick(r)}
          className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-secondary"
        >
          <span>
            <strong>{r.name}</strong>
            <span className="text-muted-foreground">
              {' '}
              · {[r.city, r.state].filter(Boolean).join(', ')} · {r.type}
            </span>
          </span>
          <Check className="size-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
