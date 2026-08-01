import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, Field } from '../components/ui';

export function Login() {
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to={user.mustSetPassword ? '/clave' : '/'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Correo o contraseña incorrectos.'
          : err instanceof ApiError
            ? err.message
            : 'No hay conexión con la API. Comprueba que esté levantada.',
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
            Bucaramanga · Santander
          </span>
          <h1 style={{ marginTop: 10, fontSize: '2.5rem', color: '#fff' }}>
            Serrano
            <br />
            Inmobiliaria
          </h1>
          <p
            style={{
              marginTop: 14,
              maxWidth: '34ch',
              color: '#9fb5aa',
              fontSize: '0.9375rem',
            }}
          >
            El inventario, la cartera y la agenda del equipo en un solo sitio.
          </p>
        </div>

        <div className="auth-figures">
          <div className="auth-figure">
            <b>642</b>
            <span>Inmuebles</span>
          </div>
          <div className="auth-figure">
            <b>7.529</b>
            <span>Clientes</span>
          </div>
          <div className="auth-figure">
            <b>11</b>
            <span>Portales</span>
          </div>
        </div>
      </aside>

      <main className="auth-form">
        <form className="auth-box stack" onSubmit={submit}>
          <div>
            <span className="note">Acceso del equipo</span>
            <h2 style={{ marginTop: 6 }}>Entra a tu cuenta</h2>
          </div>

          {error && <div className="alert">{error}</div>}

          <Field
            label="Correo"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="asesor@serrano-inmobiliaria.com"
          />
          <Field
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" variant="primary" loading={busy}>
            Entrar
          </Button>

          <p className="field-hint">
            ¿Es tu primera vez? Entra con la clave que te dio la administración; la
            aplicación te pedirá cambiarla.
          </p>
        </form>
      </main>
    </div>
  );
}
