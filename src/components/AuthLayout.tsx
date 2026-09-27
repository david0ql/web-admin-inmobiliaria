import type { ReactNode } from 'react';

/**
 * La pantalla de acceso: el logotipo y el formulario, centrados.
 *
 * Antes era una pantalla partida —panel negro con reticula de plano, titular a
 * dos lineas, una frase de presentacion y tres cifras del inventario— y sobre
 * ella otro titular, "Acceso del equipo". Cinco bloques de texto para pedir un
 * correo y una clave. Quien abre esta pantalla trabaja aqui: no hay nada que
 * presentarle ni que venderle, y todo ese ruido solo alargaba el camino hasta
 * el campo del correo.
 *
 * Queda el logotipo, que ya dice donde estas, y el formulario. La reticula de
 * plano se fue con el panel: sus lineas son blancas al 5% y sobre el fondo
 * claro no se veia ninguna.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-[352px]">
        <img
          src="/logo.png"
          width={550}
          height={210}
          alt="Serrano Inmobiliaria"
          className="mb-9 h-11 w-auto"
        />
        {children}
      </div>
    </div>
  );
}
