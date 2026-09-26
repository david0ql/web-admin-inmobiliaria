import { useState } from 'react';
import { ExternalLink, RefreshCw, Send, Trash2 } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { relative } from '../../lib/format';
import { SYNC_LABEL, SYNC_TONE, type PortalSync, type PortalSyncRow } from '../../lib/portals';
import { Alert, Badge, Button, Card, Empty, ErrorNote, Loading, Table, TBody, Td, Tr } from '../ui';

/**
 * Portales del inmueble, con el boton de cada uno.
 *
 * "Enviar" cuando el portal aun no tiene el anuncio; "Actualizar" cuando ya lo
 * tiene. La API decide cual de las dos cosas hace —crear o reemplazar— segun
 * lo que sabe del anuncio; aqui el rotulo solo le dice al asesor que va a
 * pasar. "Desactualizado" aparece cuando la ficha cambio despues del ultimo
 * envio: editar no reenvia solo, para que un cambio a medias no salga a ocho
 * portales.
 */
export function PortalSyncCard({
  propertyId,
  editable,
  action,
}: {
  propertyId: string;
  editable: boolean;
  /** Lo que ya habia en la cabecera de la tarjeta (el "Gestionar" de siempre). */
  action?: React.ReactNode;
}) {
  const { data, error, loading, reload } = useFetch<PortalSync>(
    (signal) => api.get<PortalSync>(`/properties/${propertyId}/portal-sync`, undefined, signal),
    [propertyId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(key: string, path: string) {
    setBusy(key);
    setFailure(null);
    try {
      await api.post(path);
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'No se pudo contactar con el portal.');
    } finally {
      setBusy(null);
      reload();
    }
  }

  const rows = data?.publications ?? [];
  const connected = rows.filter((r) => r.connected);

  return (
    <Card
      title={`Portales · ${rows.filter((r) => r.state === 'PUBLISHED').length} publicados`}
      action={
        <div className="flex items-center gap-2">
          {editable && connected.length > 0 && (
            <Button
              size="sm"
              loading={busy === 'all'}
              disabled={Boolean(busy) || !data?.publishable}
              onClick={() => void run('all', `/properties/${propertyId}/portal-sync`)}
            >
              <Send className="size-3.5" /> Enviar a todos
            </Button>
          )}
          {action}
        </div>
      }
      flush
    >
      {loading && !data && (
        <div className="p-5">
          <Loading rows={3} />
        </div>
      )}
      {error && (
        <div className="p-5">
          <ErrorNote onRetry={reload}>{error}</ErrorNote>
        </div>
      )}
      {data && (
        <>
          {(!data.publishable || failure) && (
            <div className="flex flex-col gap-2 p-4 pb-0">
              {failure && <Alert>{failure}</Alert>}
              {!data.publishable && (
                <Alert>
                  No se puede publicar todavia: {data.blockers.join('; ')}. Se enviara solo en
                  cuanto se corrija.
                </Alert>
              )}
            </div>
          )}
          {rows.length === 0 ? (
            <div className="p-5">
              <Empty title="Sin portales">
                Ningun portal esta conectado todavia. Un administrador los configura en Portales.
              </Empty>
            </div>
          ) : (
            <Table>
              <TBody>
                {rows.map((row) => (
                  <PortalRow
                    key={row.portalId}
                    row={row}
                    editable={editable && Boolean(data.publishable || row.state)}
                    busy={busy}
                    onSend={() =>
                      void run(`send:${row.portalId}`, `/properties/${propertyId}/portal-sync/${row.portalId}`)
                    }
                    onRemove={() =>
                      void run(
                        `remove:${row.portalId}`,
                        `/properties/${propertyId}/portal-sync/${row.portalId}/remove`,
                      )
                    }
                  />
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}

function PortalRow({
  row,
  editable,
  busy,
  onSend,
  onRemove,
}: {
  row: PortalSyncRow;
  editable: boolean;
  busy: string | null;
  onSend: () => void;
  onRemove: () => void;
}) {
  const live = row.state === 'PUBLISHED' || row.state === 'PENDING' || row.state === 'PAUSED';
  const exists = Boolean(row.externalId) || live;
  const detail = row.lastError ?? row.note;
  const retrying = row.pendingAction && row.nextAttemptAt;

  return (
    <Tr>
      <Td>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{row.portal.name}</span>
          {row.state ? (
            <Badge tone={SYNC_TONE[row.state]}>{SYNC_LABEL[row.state]}</Badge>
          ) : (
            <Badge>Sin enviar</Badge>
          )}
          {row.outdated && <Badge tone="amber">Desactualizado</Badge>}
          {!row.connected && <Badge>Sin integracion</Badge>}
          {row.mode === 'feed' && row.connected && <Badge tone="blue">Feed</Badge>}
          {row.externalUrl && (
            <a
              href={row.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              Ver anuncio <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {detail && (
          <p className={`mt-1 text-xs ${row.lastError ? 'text-red-700' : 'text-muted-foreground'}`}>
            {detail}
            {retrying && row.lastError ? ` · reintento ${relative(row.nextAttemptAt)}` : ''}
          </p>
        )}
        {row.lastSyncedAt && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ultimo envio {relative(row.lastSyncedAt)}
          </p>
        )}
      </Td>
      <Td className="w-[1%] whitespace-nowrap text-right">
        {editable && row.connected && (
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant={row.outdated || !exists ? 'default' : 'outline'}
              loading={busy === `send:${row.portalId}`}
              disabled={Boolean(busy)}
              onClick={onSend}
            >
              {exists ? <RefreshCw className="size-3.5" /> : <Send className="size-3.5" />}
              {exists ? 'Actualizar' : 'Enviar'}
            </Button>
            {live && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === `remove:${row.portalId}`}
                disabled={Boolean(busy)}
                onClick={() => {
                  if (window.confirm(`¿Retirar el inmueble de ${row.portal.name}?`)) onRemove();
                }}
                aria-label={`Retirar de ${row.portal.name}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </Td>
    </Tr>
  );
}
