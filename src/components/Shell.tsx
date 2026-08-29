import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  ChevronRight,
  CircleUser,
  Globe,
  Home,
  LogOut,
  MapPinned,
  Menu,
  Settings,
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
  end?: boolean;
  /** Si se indica, el enlace solo existe para esos perfiles. */
  roles?: Role[];
}

interface NavGroup {
  /** Clave estable con la que se recuerda si el grupo quedo abierto. */
  id: string;
  label: string;
  icon: ReactNode;
  children: NavItem[];
}

type NavEntry = (NavItem & { icon: ReactNode }) | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

/*
  El arbol esta ordenado y nombrado como el de WASI, que es de donde viene la
  agencia: un asesor tiene que encontrar cada cosa donde ya la buscaba. Lo que
  no existe alli —consignaciones, creditos, conversaciones, asistente, textos,
  sedes— cuelga del grupo de WASI al que pertenece por naturaleza, no de uno
  nuevo, para no duplicar sitios donde mirar.
*/
const MAIN: NavEntry[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: <Home />,
    children: [
      { to: '/', label: 'Panel', end: true },
      { to: '/agenda', label: 'Agenda' },
      // Marcar entrada y salida es de todos y es de todos los dias, como abrir
      // el panel o mirar la agenda: por eso vive aqui y no en Gestion. `end`
      // porque la historia del equipo cuelga de esta misma ruta y sin el los
      // dos enlaces se encenderian a la vez.
      { to: '/asistencia', label: 'Mi asistencia', end: true },
    ],
  },
  {
    id: 'inmuebles',
    label: 'Inmuebles',
    icon: <Building2 />,
    children: [
      { to: '/inmuebles', label: 'Todos los inmuebles' },
      { to: '/proyectos', label: 'Proyectos' },
      // Lo que entra por el sitio publico es inventario por nacer, no una
      // gestion aparte: se mira desde donde se mira el inventario.
      { to: '/solicitudes', label: 'Consignaciones' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: <Users />,
    children: [
      { to: '/clientes', label: 'Todos los clientes' },
      { to: '/embudo', label: 'Embudo' },
      { to: '/conversaciones', label: 'Conversaciones' },
      { to: '/creditos', label: 'Solicitudes de crédito' },
    ],
  },
  // Un solo informe no es un desplegable: seria abrir un cajon para sacar una
  // cosa. Se queda de enlace suelto con el nombre que usa WASI.
  { to: '/informes', label: 'Reportes', icon: <BarChart3 /> },
];

const MANAGE: NavEntry[] = [
  // A proposito distinto de `Users`: equipo y clientes tienen que leerse
  // aparte de un vistazo.
  { to: '/equipo', label: 'Usuarios', icon: <UserCog /> },
  /*
    La historia de asistencia va pegada a Usuarios porque es lo mismo mirado
    por otro lado: quien esta en el equipo y que hace ese equipo. No entra en
    ningun grupo —seria abrir un cajon para sacar una cosa, igual que Reportes—
    y no existe para quien no manda sobre nadie: un asesor tiene su propia
    pantalla en Inicio, y de los demas no ve nada.
  */
  {
    to: '/asistencia/historial',
    label: 'Asistencia',
    icon: <MapPinned />,
    roles: ['ADMIN', 'DIRECTOR', 'COORDINATOR', 'MANAGER'],
  },
  {
    id: 'sitio',
    label: 'Sitio web',
    icon: <Globe />,
    children: [
      { to: '/portada', label: 'Portada' },
      { to: '/textos', label: 'Textos' },
      { to: '/asistente', label: 'Asistente' },
      // Los portales son la otra cara publica del inventario: se decide junto
      // a lo que se publica, no junto a los ajustes internos.
      { to: '/portales', label: 'Portales' },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: <Settings />,
    children: [
      // Abrir y cerrar oficinas es decision de la empresa, no de una oficina:
      // el enlace no existe para nadie mas que el administrador.
      { to: '/sedes', label: 'Sedes', roles: ['ADMIN'] },
      { to: '/agenda-config', label: 'Horarios' },
    ],
  },
  /*
    A `/mi-cuenta`, no a `/clave`. `/clave` sigue existiendo, pero es la
    pantalla de la contrasena inicial obligatoria: vive fuera del Shell y es a
    donde `Protected()` manda a quien todavia arrastra la generica. Ahora que
    cada uno tiene una ficha propia que editar, el enlace del menu apunta ahi.
  */
  { to: '/mi-cuenta', label: 'Mi cuenta', icon: <CircleUser /> },
];

/** Si el enlace es el que se esta viendo — la misma regla que aplica NavLink. */
function isActive(item: NavItem, pathname: string) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const GROUPS_KEY = 'serrano.rail.grupos';

/**
 * Que grupos estan desplegados.
 *
 * Lo guardado es lo que el usuario decidio a mano, no una foto del rail: un
 * grupo del que nunca toco la flecha se abre solo cuando dentro esta la
 * pantalla que se ve. Asi cambiar de seccion despliega la que toca sin
 * reabrir lo que el habia cerrado, y lo que si toco sobrevive a la navegacion
 * y a la recarga.
 */
function useRailGroups(pathname: string) {
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  const toggle = (id: string, open: boolean) => {
    setChosen((prev) => {
      const next = { ...prev, [id]: open };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Navegacion privada: se pierde al recargar y no pasa nada.
      }
      return next;
    });
  };

  const isOpen = (group: NavGroup) =>
    chosen[group.id] ?? group.children.some((child) => isActive(child, pathname));

  return { isOpen, toggle };
}

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

/*
  El hijo no lleva icono ni versal: la sangria y el filete de la izquierda son
  lo que dice que cuelga de algo, y bajar la voz evita que los dos niveles
  compitan por la mirada.
*/
const RAIL_SUB = cn(
  'flex items-center rounded-md py-1.5 pr-3 pl-6',
  'text-[13px] font-medium tracking-tight normal-case',
  'text-white/60 transition-colors hover:bg-white/10 hover:text-white',
  '[&.active]:bg-white [&.active]:text-rail',
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

/** Un desplegable del rail con sus hijos dentro. */
function RailGroup({
  group,
  open,
  onToggle,
  onNavigate,
  pathname,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: (open: boolean) => void;
  onNavigate: () => void;
  pathname: string;
}) {
  const panelId = `rail-${group.id}`;
  const holdsActive = group.children.some((child) => isActive(child, pathname));

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
        className={cn(
          RAIL_LINK,
          'w-full cursor-pointer text-left',
          // Cerrado, el grupo es lo unico que queda en pantalla de la pagina
          // que se esta viendo: sin esta marca el rail no diria donde estas.
          holdsActive && !open && 'bg-white/10 text-white',
        )}
      >
        {group.icon}
        <span className="flex-1">{group.label}</span>
        <ChevronRight
          aria-hidden
          className={cn('transition-transform duration-150', open && 'rotate-90')}
        />
      </button>

      <div id={panelId} hidden={!open} className="mt-0.5 ml-5 border-l border-white/10 pl-1.5">
        {group.children.map((child) => (
          <NavLink
            key={child.to}
            to={child.to}
            end={child.end}
            className={RAIL_SUB}
            onClick={onNavigate}
          >
            {child.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function RailNav({
  onNavigate,
  groups,
  pathname,
}: {
  onNavigate: () => void;
  groups: ReturnType<typeof useRailGroups>;
  pathname: string;
}) {
  const { user, signOut } = useAuth();
  const allowed = (item: NavItem) =>
    !item.roles || (user ? item.roles.includes(user.role) : false);

  /*
    Los permisos se aplican antes de pintar y hacia arriba: un grupo al que el
    perfil no le deja ver ninguno de sus hijos no aparece, para que nadie abra
    una flecha y se encuentre el hueco.
  */
  const render = (entry: NavEntry) => {
    if (!isGroup(entry)) {
      return allowed(entry) ? (
        <NavLink
          key={entry.to}
          to={entry.to}
          end={entry.end}
          className={RAIL_LINK}
          onClick={onNavigate}
        >
          {entry.icon}
          {entry.label}
        </NavLink>
      ) : null;
    }

    const children = entry.children.filter(allowed);
    if (!children.length) return null;
    const group = { ...entry, children };

    return (
      <RailGroup
        key={group.id}
        group={group}
        open={groups.isOpen(group)}
        onToggle={(open) => groups.toggle(group.id, open)}
        onNavigate={onNavigate}
        pathname={pathname}
      />
    );
  };

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
        {MAIN.map(render)}

        <div className="micro-label px-3 pt-5 pb-1.5 text-white/40">Gestión</div>
        {MANAGE.map(render)}
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
  // El rail se pinta dos veces —columna y Sheet—: el estado de los grupos vive
  // aqui para que abrir uno en el movil no deje el otro a su aire.
  const groups = useRailGroups(location.pathname);

  return (
    <div className="grid min-h-screen lg:grid-cols-[var(--spacing-rail)_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-t-4 border-rail-line bg-rail text-white lg:flex">
        <RailNav onNavigate={() => undefined} groups={groups} pathname={location.pathname} />
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
          <RailNav
            onNavigate={() => setOpen(false)}
            groups={groups}
            pathname={location.pathname}
          />
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
