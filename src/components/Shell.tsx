import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarClock,
  MessageSquare,
  Sparkles,
  CalendarDays,
  CreditCard,
  Globe,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  SquareKanban,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';
import { Avatar, Button, Sheet, SheetContent, SheetTitle } from './ui';
import { cn } from '../lib/utils';

/**
 * El marco del panel: rail a la izquierda y contenido a la derecha.
 *
 * El rail es la misma tinta que la barra superior del sitio publico —negro con
 * el filete de 4px arriba— para que las dos caras del producto se lean como la
 * misma marca. Por debajo de 992px no existe como columna: se abre en un Sheet
 * de Radix, que trae la trampa de foco, el Escape y el bloqueo de scroll ya
 * hechos.
 */

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Panel', icon: <LayoutDashboard />, end: true },
  { to: '/inmuebles', label: 'Inmuebles', icon: <Home /> },
  { to: '/proyectos', label: 'Proyectos', icon: <Building2 /> },
  { to: '/clientes', label: 'Clientes', icon: <Users /> },
  { to: '/embudo', label: 'Embudo', icon: <SquareKanban /> },
  { to: '/agenda', label: 'Agenda', icon: <CalendarDays /> },
];

const MANAGE: NavItem[] = [
  { to: '/solicitudes', label: 'Solicitudes', icon: <Inbox /> },
  { to: '/creditos', label: 'Créditos', icon: <CreditCard /> },
  { to: '/portales', label: 'Portales', icon: <Globe /> },
  { to: '/informes', label: 'Informes', icon: <BarChart3 /> },
  // A proposito distinto de `Users`: equipo y clientes tienen que leerse
  // aparte de un vistazo.
  { to: '/equipo', label: 'Equipo', icon: <UserCog /> },
  { to: '/agenda-config', label: 'Horarios', icon: <CalendarClock /> },
  { to: '/conversaciones', label: 'Conversaciones', icon: <MessageSquare /> },
  { to: '/asistente', label: 'Asistente', icon: <Sparkles /> },
];

/*
  El className de NavLink va como cadena y el estado activo se pesca con
  `[&.active]`, no con la forma de funcion. NavLink ya anade la clase `active`
  el solo, y la forma de funcion se pierde en cuanto el enlace pasa por un Slot.
*/
const RAIL_LINK = cn(
  'flex items-center gap-2.5 rounded-md px-3 py-2',
  'text-[13px] font-medium tracking-wide uppercase',
  'text-white/70 transition-colors hover:bg-white/10 hover:text-white',
  '[&.active]:bg-white [&.active]:text-rail',
  '[&_svg]:size-4 [&_svg]:shrink-0',
);

function RailNav({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut } = useAuth();

  return (
    <>
      <NavLink
        to="/"
        onClick={onNavigate}
        className="flex flex-col gap-0.5 px-4 py-4 [&.active]:bg-transparent"
      >
        <strong className="text-base leading-none font-semibold tracking-tight text-white">
          Serrano
        </strong>
        <span className="note text-white/50">Inmobiliaria</span>
      </NavLink>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        {MAIN.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={RAIL_LINK}
            onClick={onNavigate}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        <div className="micro-label px-3 pt-5 pb-1.5 text-white/40">Gestión</div>
        {MANAGE.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={RAIL_LINK}
            onClick={onNavigate}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-2.5 mt-2 mb-3 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2.5 px-1 pb-2">
          <Avatar name={user?.fullName ?? ''} src={user?.photoUrl} />
          <div className="min-w-0">
            <strong className="block truncate text-[13px] font-medium text-white">
              {user?.fullName}
            </strong>
            <span className="note block truncate text-white/50">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void signOut()}
          className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LogOut />
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}

export function Shell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="grid min-h-screen lg:grid-cols-[var(--spacing-rail)_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-t-4 border-rail-line bg-rail text-white lg:flex">
        <RailNav onNavigate={() => undefined} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-rail border-t-4 border-r-0 border-rail-line bg-rail p-0 text-white lg:hidden"
        >
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          {/* El Sheet copiado no trae boton de cerrar: sobre el negro del rail
              la esquina superior derecha la ocupa la marca. Va aqui, abajo. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="absolute top-4 right-3 rounded-md p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
          <RailNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <Outlet key={location.pathname} context={{ openRail: () => setOpen(true) }} />
      </div>
    </div>
  );
}

/**
 * Cabecera de pagina. El eyebrow dice donde estas; el titulo, que hay aqui.
 *
 * Lleva `data-page-header` porque `lib/scroll.ts` mide su alto para no dejar la
 * primera fila de una lista debajo de ella al paginar. Y aqui vive el boton del
 * menu movil: el contexto `openRail` existia desde el primer dia sin que nadie
 * lo consumiera, asi que el rail off-canvas era inalcanzable.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  actions?: ReactNode;
}) {
  const { openRail } = useOutletContext<{ openRail: () => void }>();

  return (
    <header
      data-page-header
      className="sticky top-0 z-30 flex flex-wrap items-end justify-between gap-4 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:px-8"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir menú"
          onClick={openRail}
        >
          <Menu />
        </Button>
        <div className="min-w-0">
          <span className="note block">{eyebrow}</span>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
