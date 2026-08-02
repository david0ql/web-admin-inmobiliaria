import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/* Copiado de web-sell/src/components/ui/button.tsx. La unica diferencia es la
   prop `loading`, que el panel usa en cada formulario que envia. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        // El boton del tema es negro macizo, sin degradado ni borde.
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border border-input bg-background hover:bg-secondary hover:text-secondary-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-secondary hover:text-secondary-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        /* El "VER DETALLES" que aparece sobre la foto al pasar el raton. */
        overlay:
          'border-2 border-white text-white text-xs font-bold uppercase tracking-wide hover:bg-white hover:text-primary',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  /*
    Con `asChild`, Slot reparte las props sobre un unico hijo y exige
    exactamente uno. `{loading && <Loader2/>}{children}` produce SIEMPRE dos
    entradas —`false` cuenta— asi que ahi se pasa `children` tal cual y el
    spinner no existe. Los botones que usan `asChild` son enlaces: no envian
    nada, no tienen estado de carga.
  */
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      data-slot="button"
      disabled={disabled ?? loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
