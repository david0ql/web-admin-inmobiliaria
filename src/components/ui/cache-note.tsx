import { Clock } from 'lucide-react'

/**
 * El aviso de la caché.
 *
 * La web pública guarda sus respuestas cinco minutos, y el navegador de cada
 * visitante también. Al guardar aquí, el servidor tira lo suyo al momento —así
 * que recargando se ve el cambio—, pero la copia que ya está en el navegador de
 * alguien no se la puede quitar nadie hasta que caduque.
 *
 * Se dice con todas las letras porque la alternativa es que alguien guarde,
 * mire la web, no vea el cambio y piense que no se guardó.
 */
export function CacheNote() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-md border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
      <Clock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        La web pública guarda estos datos <strong>5 minutos</strong> para ir
        rápida. Al guardar, el servidor se actualiza al momento; a un visitante
        que ya tuviera la página abierta puede tardarle hasta 5 minutos en
        verlo.
      </span>
    </p>
  )
}
