import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, Field } from '../components/ui';

/**
 * Cambio obligatorio de la clave inicial.
 *
 * Los asesores importados de WASI nacen con una contrasena generica comun. La
 * API les responde 403 a todo hasta que la cambian, asi que esta pantalla es
 * lo unico que pueden hacer al entrar por primera vez.
 */
export function ChangePassword() {
  const { user, changePassword, loading } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user && !done) return <Navigate to="/acceso" replace />;
  if (done) return <Navigate to="/acceso" replace state={{ passwordChanged: true }} />;

  const forced = user?.mustSetPassword ?? false;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat) {
      setError('La confirmación no coincide con la contraseña nueva.');
      return;
    }
    if (next.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    if (next === current) {
      setError('La contraseña nueva debe ser distinta de la actual.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div>
          <span className="note" style={{ color: '#708d7f' }}>
            Seguridad
          </span>
          <h1 style={{ marginTop: 10, fontSize: '2.25rem', color: '#fff' }}>
            Elige tu
            <br />
            contraseña
          </h1>
          <p
            style={{
              marginTop: 14,
              maxWidth: '36ch',
              color: '#9fb5aa',
              fontSize: '0.9375rem',
            }}
          >
            La clave con la que entraste la comparte todo el equipo. Mientras siga siendo
            esa, tu cuenta no puede ver ni la cartera ni el inventario.
          </p>
        </div>
        <span className="note" style={{ color: '#5f776b' }}>
          Mínimo 8 caracteres
        </span>
      </aside>

      <main className="auth-form">
        <form className="auth-box stack" onSubmit={submit}>
          <div>
            <span className="note">{user?.email}</span>
            <h2 style={{ marginTop: 6 }}>
              {forced ? 'Cambia la clave inicial' : 'Cambiar contraseña'}
            </h2>
          </div>

          {forced && (
            <div className="alert alert-warn">
              Es tu primer acceso. Define una contraseña personal para continuar.
            </div>
          )}
          {error && <div className="alert">{error}</div>}

          <Field
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Field
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Field
            label="Repite la nueva"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />

          <Button type="submit" variant="primary" loading={busy}>
            Guardar contraseña
          </Button>

          <p className="field-hint">
            Al guardarla se cierran todas tus sesiones y tendrás que entrar de nuevo.
          </p>
        </form>
      </main>
    </div>
  );
}
