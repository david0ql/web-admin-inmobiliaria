import { useState, type FormEvent } from 'react';
import { ApiError, api, type Me } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Shell';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  PageBody,
  SectionHeading,
} from '../components/ui';
import { ROLE_LABEL } from '../lib/format';
import {
  IdentityFields,
  PhotoPicker,
  draftFrom,
  identityPayload,
  type IdentityDraft,
} from '../components/people/identity';

/**
 * Mi cuenta.
 *
 * Lo que cada uno puede cambiar de si mismo, y solo eso: nombre, correo,
 * telefono, foto y contrasena. El perfil y la sede no aparecen —ni siquiera
 * apagados—, porque un campo gris sin explicacion invita a preguntar por que
 * esta ahi; en su lugar se dicen con palabras y se dice quien los mueve.
 */
export function Profile() {
  const { user, refreshUser } = useAuth();

  if (!user) return null;
  return <ProfileForm key={user.id} user={user} onSaved={refreshUser} />;
}

function ProfileForm({ user, onSaved }: { user: Me; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<IdentityDraft>(() => draftFrom(user));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch(`/agents/${user.id}`, identityPayload(draft));
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Tu cuenta" title="Mi cuenta" />

      <PageBody>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex flex-col gap-4">
              <SectionHeading light="Tus" strong="datos" as="h2" />

              {error && <Alert>{error}</Alert>}
              {saved && <Alert tone="ok">Datos guardados.</Alert>}

              <PhotoPicker
                agentId={user.id}
                name={user.fullName}
                photoUrl={user.photoUrl}
                onChanged={() => void onSaved()}
              />

              <IdentityFields draft={draft} onChange={setDraft} />

              <p className="text-xs text-muted-foreground">
                Tu perfil es <Badge tone="neutral">{ROLE_LABEL[user.role] ?? user.role}</Badge>.
                El perfil y la sede los cambia la administración: no son cosas que
                uno se ponga a sí mismo.
              </p>

              <Button
                className="self-start"
                loading={busy}
                disabled={!draft.firstName.trim() || !draft.email.trim()}
                onClick={() => void save()}
              >
                Guardar datos
              </Button>
            </div>
          </Card>

          <Card>
            <ChangeOwnPassword />
          </Card>
        </div>
      </PageBody>
    </>
  );
}

/**
 * Cambiar la propia contrasena.
 *
 * Pide la actual, y eso no es burocracia: sin ella, un portatil abierto un
 * minuto o una sesion robada bastan para quedarse con la cuenta para siempre.
 * El caso en el que NO se pide —la administracion restableciendole la clave a
 * alguien— vive en otra pantalla a proposito, porque es otra cosa.
 */
function ChangeOwnPassword() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat) {
      setError('La confirmación no coincide con la contraseña nueva.');
      return;
    }
    if (next === current) {
      setError('La contraseña nueva debe ser distinta de la actual.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // `changePassword` limpia la sesion de este navegador tambien: la API
      // revoca todos los tokens, incluido el que se esta usando.
      await changePassword(current, next);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.',
      );
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <SectionHeading light="Cambiar" strong="contraseña" as="h2" />

      <Alert tone="warn">
        Al cambiarla se cierran todas tus sesiones —esta incluida— y tendrás que
        volver a entrar con la nueva.
      </Alert>
      {error && <Alert>{error}</Alert>}

      <Field
        label="Contraseña actual"
        type="password"
        autoComplete="current-password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Mínimo 8 caracteres."
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

      <Button type="submit" loading={busy} className="self-start">
        Cambiar contraseña
      </Button>
    </form>
  );
}
