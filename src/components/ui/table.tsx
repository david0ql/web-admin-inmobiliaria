import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * La tabla del panel. No existe en web-sell —el sitio publico no lista nada en
 * rejilla— pero doce pantallas de aqui escriben treinta y dos tablas, y sin un
 * primitivo cada una acaba con su propia cadena de clases.
 *
 * `num` hace dos cosas a la vez: alinea a la derecha y pone `tabular`. Eso
 * ultimo importa mas de lo que parece — el tema anterior ponia
 * `font-variant-numeric: tabular-nums` en el `body`, global; el sistema nuevo lo
 * tiene acotado a `.tabular`, asi que sin esto las columnas de cifras dejarian
 * de alinearse en silencio.
 */

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-wrap" className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}

function Th({
  num,
  hideSm,
  className,
  ...props
}: React.ComponentProps<'th'> & { num?: boolean; hideSm?: boolean }) {
  return (
    <th
      className={cn(
        'micro-label border-b bg-card px-3 py-2.5 text-left whitespace-nowrap text-muted-foreground',
        num && 'text-right',
        // `max-md:hidden` y no `hidden md:table-cell`: la celda tiene que seguir
        // siendo celda a partir de 768px, y `md:block` romperia la fila.
        hideSm && 'max-md:hidden',
        className,
      )}
      {...props}
    />
  )
}

function Td({
  num,
  hideSm,
  className,
  ...props
}: React.ComponentProps<'td'> & { num?: boolean; hideSm?: boolean }) {
  return (
    <td
      className={cn(
        'border-b px-3 py-2.5 align-middle',
        num && 'tabular text-right',
        hideSm && 'max-md:hidden',
        className,
      )}
      {...props}
    />
  )
}

function Tr({ onClick, className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors hover:bg-secondary/60 last:[&>td]:border-b-0',
        onClick && 'cursor-pointer',
        className,
      )}
      {...props}
    />
  )
}

function THead(props: React.ComponentProps<'thead'>) {
  return <thead {...props} />
}

function TBody(props: React.ComponentProps<'tbody'>) {
  return <tbody {...props} />
}

export { Table, TBody, Td, Th, THead, Tr }
