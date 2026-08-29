import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import {
  BarChart3,
  Languages,
  Building2,
  CalendarClock,
  LayoutTemplate,
  MessageSquare,
  Sparkles,
  CalendarDays,
  CreditCard,
  Globe,
  Home,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  SquareKanban,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useBranch } from '../lib/branch';
import type { Role } from '../lib/api';
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
  /** Si se indica, el enlace solo existe para esos perfiles. */
  roles?: Role[];
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
  // Abrir y cerrar oficinas es decision de la empresa, no de una oficina: el
  // enlace no existe para nadie mas que el administrador.
  { to: '/sedes', label: 'Sedes', icon: <Landmark />, roles: ['ADMIN'] },
  { to: '/agenda-config', label: 'Horarios', icon: <CalendarClock /> },
  { to: '/portada', label: 'Portada', icon: <LayoutTemplate /> },
  { to: '/conversaciones', label: 'Conversaciones', icon: <MessageSquare /> },
  { to: '/asistente', label: 'Asistente', icon: <Sparkles /> },
  { to: '/textos', label: 'Textos', icon: <Languages /> },
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

/**
 * El selector de sede, justo bajo la marca.
 *
 * Solo se pinta cuando hay algo que elegir. Quien pertenece a una oficina no
 * elige —la API le impone la suya y la cabecera ni se mira—, pero si lee cual
 * es: sin eso, dos coordinadores con el mismo panel delante no sabrian por que
 * ven inventarios distintos.
 */
function BranchPicker() {
  const { branches, branchId, current, seesAll, setBranchId } = useBranch();

  if (!seesAll) {
    if (!current) return null;
    return (
      <div className="mx-2.5 mb-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
        <span className="micro-label block text-white/40">Sede</span>
        <strong className="block truncate text-[13px] font-medium text-white">
          {current.name}
        </strong>
      </div>
    );
  }

  // Con una sola oficina, "todas" y "la unica" son lo mismo: un desplegable de
  // dos opciones equivalentes solo hace ruido.
  if (branches.length < 2) return null;

  return (
    <label className="mx-2.5 mb-3 block">
      <span className="micro-label mb-1 block text-white/40">Sede</span>
      <select
        value={branchId ?? ''}
        onChange={(e) => setBranchId(e.target.value || null)}
        className="h-9 w-full rounded-md border border-white/15 bg-white/10 px-2.5 text-[13px] text-white outline-none transition-colors hover:bg-white/15 focus-visible:border-white/40"
      >
        {/* Las opciones se pintan con los colores del sistema, no con los del
            rail: van en claro a proposito para que se lean al desplegar. */}
        <option value="" className="bg-white text-black">
          Todas las sedes
        </option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id} className="bg-white text-black">
            {branch.name}
            {!branch.active ? ' (inactiva)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function RailNav({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut } = useAuth();
  const visible = (item: NavItem) =>
    !item.roles || (user ? item.roles.includes(user.role) : false);

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

      <BranchPicker />

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
        {MANAGE.filter(visible).map((item) => (
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
  const { branchId } = useBranch();

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
        {/*
          La sede entra en la clave del Outlet, no solo la ruta. Cambiarla
          desmonta y vuelve a montar la pantalla que se este viendo, con lo que
          todos sus `useFetch` se rehacen ya con la cabecera nueva. Es la forma
          de refrescar sin recargar la pagina entera —y sin que cada pantalla
          tenga que acordarse de escuchar el cambio—; el precio es perder los
          filtros y el scroll de esa pantalla, que es justo lo que se espera al
          mudarse de oficina.
        */}
        <Outlet
          key={`${location.pathname}:${branchId ?? 'todas'}`}
          context={{ openRail: () => setOpen(true) }}
        />
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
