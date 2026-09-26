import { useState } from 'react';
import { Copy } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { PortalConnection } from '../../lib/portals';
import { Alert, Badge, Button, CheckField, Field, Modal } from '../ui';

/**
 * Credenciales y ajustes de un portal. Solo administracion.
 *
 * Los secretos nunca vuelven de la API: un campo secreto ya guardado se ve
 * vacio con el rotulo "guardado", y dejarlo vacio conserva lo que habia. Para
 * cambiarlo se escribe entero.
 */
export function ConnectionModal({
  connection,
  onClose,
  onSaved,
}: {
  connection: PortalConnection;
  onClose: () => void;
  onSaved: (next: PortalConnection) => void;
}) {
  const [conn, setConn] = useState(connection);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>(
    Object.fromEntries(connection.settings.map((f) => [f.key, f.value])),
  );
  const [sandbox, setSandbox] = useState(connection.sandbox);
  const [autoPublishNew, setAutoPublishNew] = useState(connection.autoPublishNew);
  const [busy, setBusy] = useState<'save' | 'test' | 'toggle' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(kind: 'save' | 'test' | 'toggle', fn: () => Promise<PortalConnection>) {
    setBusy(kind);
    setError(null);
    try {
      const next = await fn();
      setConn(next);
      setCredentials({});
      onSaved(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    call('save', () =>
      api.patch<PortalConnection>(`/publishing/connections/${conn.portalId}`, {
        credentials,
        settings,
        sandbox,
        autoPublishNew,
      }),
    );

  // Probar guarda antes: se prueba lo que se ve en el formulario.
  const test = () =>
    call('test', async () => {
      await api.patch(`/publishing/connections/${conn.portalId}`, { credentials, settings, sandbox, autoPublishNew });
      return api.post<PortalConnection>(`/publishing/connections/${conn.portalId}/test`);
    });

  const toggle = () =>
    call('toggle', () =>
      api.patch<PortalConnection>(`/publishing/connections/${conn.portalId}`, { enabled: !conn.enabled }),
    );

  return (
    <Modal
      title={`Conexion con ${conn.portal.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {conn.mode === 'push' && (
            <Button variant="outline" loading={busy === 'test'} disabled={Boolean(busy)} onClick={() => void test()}>
              Guardar y probar
            </Button>
          )}
          <Button loading={busy === 'save'} disabled={Boolean(busy)} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!conn.secretKeyConfigured && conn.credentials.length > 0 && (
          <Alert>
            Falta PORTALS_SECRET_KEY en el servidor: sin ella no se pueden guardar credenciales.
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        {conn.instructions && <p className="text-sm text-muted-foreground">{conn.instructions}</p>}

        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <span className="text-sm font-medium">Estado:</span>
          {conn.enabled ? <Badge tone="green">Conectado</Badge> : <Badge>Apagado</Badge>}
          {conn.lastCheckAt && (
            <Badge tone={conn.lastCheckOk ? 'green' : 'red'}>
              Prueba {conn.lastCheckOk ? 'correcta' : 'fallida'} · {dateTime(conn.lastCheckAt)}
            </Badge>
          )}
          <Button
            size="sm"
            variant={conn.enabled ? 'outline' : 'default'}
            className="ml-auto"
            loading={busy === 'toggle'}
            disabled={Boolean(busy)}
            onClick={() => void toggle()}
          >
            {conn.enabled ? 'Apagar' : 'Encender'}
          </Button>
        </div>
        {conn.lastCheckMessage && (
          <p className={`text-sm ${conn.lastCheckOk ? 'text-muted-foreground' : 'text-red-700'}`}>
            {conn.lastCheckMessage}
          </p>
        )}

        {conn.credentials.length > 0 && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="micro-label mb-2 text-muted-foreground">Credenciales (se guardan cifradas)</legend>
            {conn.credentials.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                required={f.required && !f.filled}
                type="password"
                autoComplete="off"
                placeholder={f.filled ? '•••••• guardado' : ''}
                hint={f.help}
                value={credentials[f.key] ?? ''}
                onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            ))}
          </fieldset>
        )}

        {conn.settings.length > 0 && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="micro-label mb-2 text-muted-foreground">Ajustes</legend>
            {conn.settings.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
                hint={f.help}
                value={settings[f.key] ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            ))}
          </fieldset>
        )}

        <div className="flex flex-col gap-2">
          <CheckField
            checked={autoPublishNew}
            onChange={(e) => setAutoPublishNew(e.target.checked)}
            label="Publicar automaticamente cada inmueble nuevo"
          />
          {conn.mode === 'push' && (
            <CheckField
              checked={sandbox}
              onChange={(e) => setSandbox(e.target.checked)}
              label="Entorno de pruebas del portal (si lo tiene)"
            />
          )}
        </div>

        {conn.feedUrl && (
          <CopyRow
            label="URL del feed: registrala en el portal"
            value={conn.feedUrl}
          />
        )}
        {conn.callbackUrl && (
          <CopyRow
            label="URL de avisos (webhook / responseUrl) que usa el portal"
            value={conn.callbackUrl}
          />
        )}
      </div>
    </Modal>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <span className="micro-label text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-secondary px-2 py-1.5 text-xs">{value}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          <Copy className="size-3.5" /> {copied ? 'Copiada' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}
