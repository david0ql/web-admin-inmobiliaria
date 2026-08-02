import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { Input } from './input'
import { Textarea } from './textarea'
import { cn } from '@/lib/utils'

/**
 * Campo con rotulo. El `<label>` envuelve al control, asi que no hace falta
 * plumbing de `id`/`htmlFor` ni el Label de Radix.
 *
 * El rotulo es la micro-etiqueta del sistema (`.micro-label`), que es lo que en
 * web-sell marca "Detalles del inmueble" o las leyendas de los formularios.
 */

interface FieldShell {
  label: string
  hint?: ReactNode
  required?: boolean
  className?: string
}

function Shell({
  label,
  hint,
  required,
  className,
  children,
}: FieldShell & { children: ReactNode }) {
  return (
    <label className={cn('grid content-start gap-1.5', className)}>
      <span className="micro-label text-muted-foreground">
        {label}
        {required && ' *'}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function Field({
  label,
  hint,
  required,
  className,
  ...rest
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Shell label={label} hint={hint} required={required} className={className}>
      <Input required={required} {...rest} />
    </Shell>
  )
}

/*
  Un `select` nativo y no el de Radix: los desplegables del panel son catalogos
  —ciudades, tipos, cien asesores— y ahi el nativo se porta mejor en movil.
  web-sell hace lo mismo por la misma razon en components/form/fields.tsx.
*/
const SELECT_CLASS =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive'

export function SelectField({
  label,
  hint,
  required,
  className,
  children,
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Shell label={label} hint={hint} required={required} className={className}>
      <select className={SELECT_CLASS} required={required} {...rest}>
        {children}
      </select>
    </Shell>
  )
}

export function TextareaField({
  label,
  hint,
  required,
  className,
  ...rest
}: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Shell label={label} hint={hint} required={required} className={className}>
      <Textarea required={required} {...rest} />
    </Shell>
  )
}

/** Casilla con etiqueta a la derecha. */
export function CheckField({
  label,
  className,
  ...rest
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      className={cn('flex cursor-pointer items-center gap-2 text-sm', className)}
    >
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-primary"
        {...rest}
      />
      {label}
    </label>
  )
}

export { SELECT_CLASS }
