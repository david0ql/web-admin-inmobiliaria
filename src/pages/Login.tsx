import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Alert, Button, Field, SectionHeading } from '../components/ui';
import { AuthFigure, AuthLayout } from '../components/AuthLayout';

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
    <AuthLayout
      eyebrow="Bucaramanga · Santander"
      title={
        <>
          Serrano
          <br />
          Inmobiliaria
        </>
      }
      lede="El inventario, la cartera y la agenda del equipo en un solo sitio."
      aside={
        <div className="flex flex-wrap gap-8">
          <AuthFigure value="642" label="Inmuebles" />
          <AuthFigure value="7.529" label="Clientes" />
          <AuthFigure value="11" label="Portales" />
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <SectionHeading light="Acceso" strong="del equipo" as="h2" className="mb-1" />

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
        <Field
          label="Contraseña"
          type="password"
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
