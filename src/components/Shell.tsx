import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';
import { Avatar, Button } from './ui';

/**
 * Iconos dibujados a mano en SVG con trazo de 1,5: el mismo grosor que las
 * lineas de cota del resto de la interfaz, para que no parezcan pegados de
 * otra libreria.
 */
const icon = (path: ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {path}
  </svg>
);

const ICONS = {
  dashboard: icon(
    <>
      <path d="M3 13h6V3H3zM15 21h6V11h-6zM3 21h6v-4H3zM15 7h6V3h-6z" />
    </>,
  ),
  properties: icon(
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>,
  ),
  clients: icon(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M17 11.5a3 3 0 1 0-1.6-5.5M18 20c0-2.5-.9-4.3-2.5-5.2" />
    </>,
  ),
  pipeline: icon(
    <>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="11" rx="1" />
      <rect x="17" y="4" width="4" height="7" rx="1" />
    </>,
  ),
  calendar: icon(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
  ),
  portals: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15 0 18M12 3c-2.5 2.7-2.5 15 0 18" />
    </>,
  ),
  team: icon(
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>,
  ),
  reports: icon(
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>,
  ),
};

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Panel', icon: ICONS.dashboard, end: true },
  { to: '/inmuebles', label: 'Inmuebles', icon: ICONS.properties },
  { to: '/clientes', label: 'Clientes', icon: ICONS.clients },
  { to: '/embudo', label: 'Embudo', icon: ICONS.pipeline },
  { to: '/agenda', label: 'Agenda', icon: ICONS.calendar },
];

const MANAGE: NavItem[] = [
  { to: '/portales', label: 'Portales', icon: ICONS.portals },
  { to: '/informes', label: 'Informes', icon: ICONS.reports },
  { to: '/equipo', label: 'Equipo', icon: ICONS.team },
];

export function Shell() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="shell">
      <div
        className={`rail-scrim ${open ? 'show' : ''}`.trim()}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <aside className={`rail ${open ? 'open' : ''}`.trim()}>
        <NavLink to="/" className="rail-brand" onClick={() => setOpen(false)}>
          <strong>Serrano</strong>
          <span>Inmobiliaria</span>
        </NavLink>

        <nav className="rail-nav">
          {MAIN.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}

          <div className="rail-section">Gestión</div>
          {MANAGE.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot">
          <div className="rail-user">
            <Avatar name={user?.fullName ?? ''} src={user?.photoUrl} />
            <div style={{ minWidth: 0 }}>
              <strong>{user?.fullName}</strong>
              <span>{ROLE_LABEL[user?.role ?? ''] ?? user?.role}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            style={{ color: '#b9c9c1', width: '100%', justifyContent: 'flex-start' }}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="main">
        <Outlet key={location.pathname} context={{ openRail: () => setOpen(true) }} />
      </div>
    </div>
  );
}

/** Cabecera de pagina. El eyebrow dice donde estas; el titulo, que hay aqui. */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div style={{ minWidth: 0 }}>
        <span className="note">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {actions && <div className="row row-wrap">{actions}</div>}
    </header>
  );
}
