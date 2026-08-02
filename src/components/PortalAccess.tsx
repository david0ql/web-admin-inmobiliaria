import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, Field } from './ui';
import { relative } from '../lib/format';

export interface PortalAccessState {
  hasPassword: boolean;
  portalEnabled: boolean;
  mustChangePassword: boolean;
  selfRegistered: boolean;
  lastPortalLoginAt: string | null;
  email: string | null;
}

/** Doce caracteres, la misma política que exige la API. */
const MIN_PASSWORD = 12;

/**
 * Acceso del cliente al portal, desde su ficha.
 *
 * Los 7.529 clientes heredados no tienen credencial, y está bien que sea así:
 * nadie pidió una cuenta. Esto es para cuando un propietario llama y pide
 * entrar — el asesor comprueba con quién habla, le fija una clave y se la dicta.
 *
 * Por eso la clave nace marcada como provisional: el cliente tendrá que
 * cambiarla al entrar, porque una contraseña dicha por teléfono la conocen dos
 * personas.
 */
export function PortalAccess({ clientId }: { clientId: string }) {
  const { can } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const { data, error: loadError, reload } = useFetch<PortalAccessState>(
    (signal) =>
      api.get<PortalAccessState>(`/clients/${clientId}/portal`, undefined, signal),
    [clientId],
  );

  const editable = can('ADMIN', 'MANAGER', 'AGENT');

  async function send(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.patch(`/clients/${clientId}/portal`, body);
      setPassword('');
      setDone(message);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el acceso.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return null;
  if (!data) return null;

  return (
    <Card title="Acceso al portal">
      <div className="stack">
        <div className="row row-wrap" style={{ gap: 6 }}>
          {data.portalEnabled && data.hasPassword ? (
            <Badge tone="green">Puede entrar</Badge>
          ) : (
            <Badge>Sin acceso</Badge>
          )}
          {data.mustChangePassword && <Badge tone="amber">Clave provisional</Badge>}
          {data.selfRegistered && <Badge tone="blue">Se registró solo</Badge>}
        </div>

        <p className="note">
          {data.lastPortalLoginAt
            ? `Último acceso ${relative(data.lastPortalLoginAt)}.`
            : 'Nunca ha entrado.'}{' '}
          {data.email
            ? `Entra con ${data.email}.`
            : 'Sin correo en la ficha: no puede entrar hasta que se le ponga uno.'}
        </p>

        {error && <div className="alert">{error}</div>}
        {done && <div className="alert alert-ok">{done}</div>}

        {editable && data.email && (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Field
                  label={data.hasPassword ? 'Nueva contraseña' : 'Contraseña inicial'}
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
                  hint="Se la dictas al cliente. Él tendrá que cambiarla al entrar."
                  autoComplete="off"
                />
              </div>
              <Button
                loading={busy}
                disabled={password.length < MIN_PASSWORD}
                onClick={() =>
                  void send({ password }, 'Contraseña fijada. Dictásela al cliente.')
                }
              >
                {data.hasPassword ? 'Restablecer' : 'Dar acceso'}
              </Button>
            </div>

            {data.hasPassword && (
              <Button
                variant={data.portalEnabled ? 'danger' : 'default'}
                size="sm"
                loading={busy}
                onClick={() =>
                  void send(
                    { enabled: !data.portalEnabled },
                    data.portalEnabled
                      ? 'Acceso revocado y sesiones cerradas.'
                      : 'Acceso habilitado.',
                  )
                }
              >
                {data.portalEnabled ? 'Revocar acceso' : 'Habilitar acceso'}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
