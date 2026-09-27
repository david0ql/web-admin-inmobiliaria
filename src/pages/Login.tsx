import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Alert, Button, Field, PasswordField } from '../components/ui';
import { AuthLayout } from '../components/AuthLayout';

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
    <AuthLayout>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}

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
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" loading={busy} className="font-bold tracking-widest uppercase">
          Entrar
        </Button>

        <p className="text-xs text-muted-foreground">
          ¿Es tu primera vez? Entra con la clave que te dio la administración; la
          aplicación te pedirá cambiarla.
        </p>
      </form>
    </AuthLayout>
  );
}
