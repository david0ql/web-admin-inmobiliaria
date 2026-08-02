/**
 * Los primitivos de una linea: badge, card y skeleton. Cada uno en su fichero
 * seria mas ceremonia que codigo.
 *
 * Copiado de web-sell/src/components/ui/misc.tsx menos `Separator`, que el
 * panel no usa (y evita traer @radix-ui/react-separator solo para eso).
 */

import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-0.5 text-[0.625rem] font-black tracking-wide whitespace-nowrap uppercase',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-input text-foreground',
        /* La etiqueta de estado que va sobre la foto lleva su color propio. */
        tag: 'text-white shadow-sm',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function BadgeBase({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

function CardShell({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-5', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('p-5 pt-0', className)} {...props} />
  )
}

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-secondary', className)}
      {...props}
    />
  )
}

export {
  BadgeBase,
  badgeVariants,
  CardShell,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
}
