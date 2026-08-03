import { Loader2 } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { Dashboard } from './pages/Dashboard';
import { Properties } from './pages/Properties';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Consignments } from './pages/Consignments';
import { CreditRequests } from './pages/CreditRequests';
import { PropertyDetail } from './pages/PropertyDetail';
import { PropertyForm } from './pages/PropertyForm';
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { PipelineBoard } from './pages/PipelineBoard';
import { Calendar } from './pages/Calendar';
import { Portals } from './pages/Portals';
import { Reports } from './pages/Reports';
import { BookingSettings } from './pages/BookingSettings'
import { Team } from './pages/Team';

/**
 * Puerta de entrada al panel.
 *
 * Tres estados: sin sesion va al acceso; con la clave generica todavia sin
 * cambiar, a la pantalla de contrasena — que es lo unico que la API le deja
 * hacer —; y ya dentro, al panel.
 */
function Protected() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }
  if (!user) return <Navigate to="/acceso" replace />;
  if (user.mustSetPassword) return <Navigate to="/clave" replace />;
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/acceso" element={<Login />} />
          <Route path="/clave" element={<ChangePassword />} />

          <Route element={<Protected />}>
            <Route index element={<Dashboard />} />
            <Route path="inmuebles" element={<Properties />} />
            <Route path="inmuebles/nuevo" element={<PropertyForm />} />
            <Route path="inmuebles/:id" element={<PropertyDetail />} />
            <Route path="inmuebles/:id/editar" element={<PropertyForm />} />
            <Route path="proyectos" element={<Projects />} />
            <Route path="proyectos/:id" element={<ProjectDetail />} />
            <Route path="solicitudes" element={<Consignments />} />
            <Route path="creditos" element={<CreditRequests />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="clientes/:id" element={<ClientDetail />} />
            <Route path="embudo" element={<PipelineBoard />} />
            <Route path="agenda" element={<Calendar />} />
            <Route path="portales" element={<Portals />} />
            <Route path="informes" element={<Reports />} />
            <Route path="equipo" element={<Team />} />
            <Route path="agenda-config" element={<BookingSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
