import { useRef, useState } from 'react';
import { ApiError, upload, type Agent } from '../../lib/api';
import { Avatar, Button, CheckField, Field } from '../ui';
import { cn } from '../../lib/utils';

/**
 * Los datos con los que una persona se identifica en el sistema.
 *
 * Vive aparte porque se editan desde dos sitios que no se parecen —«Mi cuenta»
 * es una pagina y la ficha de otro es un modal— pero los campos son los
 * mismos. Lo que cambia entre los dos casos es el permiso y la contrasena, no
 * como se escribe un apellido.
 */
export interface IdentityDraft {
  firstName: string;
  lastName: string;
  email: string;
  cellPhone: string;
  hasWhatsapp: boolean;
}

export function draftFrom(agent: {
  firstName: string;
  lastName: string | null;
  email: string;
  cellPhone: string | null;
  hasWhatsapp: boolean;
}): IdentityDraft {
  return {
    firstName: agent.firstName,
    lastName: agent.lastName ?? '',
    email: agent.email,
    cellPhone: agent.cellPhone ?? '',
    hasWhatsapp: agent.hasWhatsapp,
  };
}

/** Lo que se manda al PATCH: sin espacios sobrantes y sin cadenas vacias. */
export function identityPayload(draft: IdentityDraft) {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim() || undefined,
    email: draft.email.trim(),
    // Una cadena vacia no es «sin telefono», es un telefono en blanco: se
    // manda `null` para que el campo quede de verdad vacio en la base.
    cellPhone: draft.cellPhone.trim() || null,
    hasWhatsapp: draft.hasWhatsapp,
  };
}

export function IdentityFields({
  draft,
  onChange,
}: {
  draft: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          required
          value={draft.firstName}
          onChange={(e) => onChange({ ...draft, firstName: e.target.value })}
        />
        <Field
          label="Apellidos"
          value={draft.lastName}
          onChange={(e) => onChange({ ...draft, lastName: e.target.value })}
        />
        <Field
          label="Correo"
          type="email"
          required
          value={draft.email}
          onChange={(e) => onChange({ ...draft, email: e.target.value })}
          hint="Es con lo que se entra al panel."
        />
        <Field
          label="Celular"
          value={draft.cellPhone}
          onChange={(e) => onChange({ ...draft, cellPhone: e.target.value })}
        />
      </div>
      <CheckField
        label="Tiene WhatsApp en ese número"
        checked={draft.hasWhatsapp}
        onChange={(e) => onChange({ ...draft, hasWhatsapp: e.target.checked })}
      />
    </>
  );
}

/**
 * La foto de perfil.
 *
 * Se sube en cuanto se elige, sin esperar al «Guardar» del formulario: es una
 * peticion aparte —multipart— y encadenarla al resto obligaria a deshacer una
 * de las dos si fallara la otra. Asi lo que se ve despues de elegir la imagen
 * es lo que hay guardado.
 */
export function PhotoPicker({
  agentId,
  name,
  photoUrl,
  onChanged,
}: {
  agentId: string;
  name: string;
  photoUrl: string | null;
  onChanged: (agent: Agent) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await upload<Agent>(`/agents/${agentId}/photo`, 'file', file));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo subir la foto.',
      );
    } finally {
      setBusy(false);
      // Sin esto, volver a elegir el MISMO fichero tras un fallo no dispara
      // `change` y la pantalla parece colgada.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={photoUrl} large />
      <div className="grid gap-1">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          className="justify-self-start"
          onClick={() => input.current?.click()}
        >
          {photoUrl ? 'Cambiar foto' : 'Subir foto'}
        </Button>
        <span
          className={cn(
            'text-xs',
            error ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {error ?? 'JPG, PNG o WebP. Se recorta a un círculo pequeño.'}
        </span>
      </div>
    </div>
  );
}
