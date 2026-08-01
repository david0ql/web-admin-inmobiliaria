import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { initials } from '../lib/format';

// --- controles -------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  loading?: boolean;
};

export function Button({
  variant = 'default',
  size = 'md',
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'ghost'
        ? 'btn-ghost'
        : variant === 'danger'
          ? 'btn-danger'
          : '';
  return (
    <button
      className={`btn ${variantClass} ${size === 'sm' ? 'btn-sm' : ''} ${className}`.trim()}
      disabled={disabled ?? loading}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}

interface FieldShell {
  label: string;
  hint?: string;
  required?: boolean;
}

export function Field({
  label,
  hint,
  required,
  ...rest
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>
        {label}
        {required && ' *'}
      </span>
      <input className="input" required={required} {...rest} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  required,
  children,
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="field">
      <span>
        {label}
        {required && ' *'}
      </span>
      <select className="select" required={required} {...rest}>
        {children}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextareaField({
  label,
  hint,
  required,
  ...rest
}: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="field">
      <span>
        {label}
        {required && ' *'}
      </span>
      <textarea className="textarea" required={required} {...rest} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

// --- superficies ------------------------------------------------------------

export function Card({
  title,
  action,
  children,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      {(title || action) && (
        <header className="card-head">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {action}
        </header>
      )}
      <div className={flush ? 'card-body card-body-flush' : 'card-body'}>{children}</div>
    </section>
  );
}

/**
 * Cifra acotada: el numero grande, y debajo la cota con el matiz en el centro.
 * Es el elemento firma de la interfaz — la lectura de un plano aplicada a un
 * indicador.
 */
export function Stat({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'neutral' | 'green' | 'amber' | 'red';
}) {
  const toneClass = tone === 'neutral' ? '' : `is-${tone}`;
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className={`stat-rule ${toneClass}`.trim()}>{note ?? '—'}</span>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  color,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';
  color?: string;
}) {
  if (color) {
    return (
      <span className="badge" style={{ borderColor: color, color }}>
        <i className="dot" style={{ background: color }} />
        {children}
      </span>
    );
  }
  return (
    <span className={`badge ${tone === 'neutral' ? '' : `badge-${tone}`}`.trim()}>{children}</span>
  );
}

export function Avatar({
  name,
  src,
  large,
}: {
  name: string;
  src?: string | null;
  large?: boolean;
}) {
  return (
    <span className={`avatar ${large ? 'avatar-lg' : ''}`.trim()} aria-hidden>
      {src ? <img src={src} alt="" /> : initials(name || '?')}
    </span>
  );
}

// --- estados ----------------------------------------------------------------

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack" style={{ gap: 8, padding: 16 }} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 34, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="alert row spread">
      <span>{children}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

// --- modal ------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? 'modal-wide' : ''}`.trim()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
            ✕
          </Button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// --- paginacion --------------------------------------------------------------

export function Pager({
  page,
  pages,
  total,
  unit,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  unit: string;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="pager">
      <span className="note">
        {total.toLocaleString('es-CO')} {unit} · página {page} de {Math.max(pages, 1)}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
