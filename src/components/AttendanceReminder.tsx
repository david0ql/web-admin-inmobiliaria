import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { attendance, bogotaToday } from '../lib/attendance';
import { useAuth } from '../lib/auth';
import { Button, Modal } from './ui';

/**
 * El recordatorio de marcar entrada.
 *
 * Nace de una queja concreta: a la gente se le olvida fichar. Un enlace mas en
 * el menu no lo arregla —el que se olvida no va a mirar el menu—, asi que al
 * entrar al panel se pone delante y luego se queda a la vista.
 *
 * Dos piezas, y el porque de que sean dos:
 *
 *   1. Un aviso en medio de la pantalla, UNA vez al dia. Interrumpir funciona
 *      la primera vez; a la tercera del dia la gente aprende donde esta la X y
 *      la pulsa sin leer, que es exactamente lo contrario de lo que se busca.
 *   2. Cerrado el aviso, queda una pastilla discreta abajo hasta que marque.
 *      Cerrar el aviso casi nunca significa "no pienso fichar" sino "ahora
 *      no"; si desapareciera del todo, el olvido —que es el problema que
 *      veniamos a resolver— volveria intacto a las diez de la mañana.
 *
 * El estado se pide con `attendance.today()` de `lib/attendance.ts`, que es el
 * contrato compartido del area: no se duplica ni la ruta ni los tipos.
 *
 * Lo que NUNCA decide el navegador es si ya marco: eso sale siempre de la API.
 * Con una marca local, quien ficha desde el movil seguiria viendo el aviso en
 * el portatil, y quien borra los datos del navegador lo veria dos veces. La
 * unica marca local es "este aviso ya interrumpio hoy", que es una preferencia
 * de interfaz y no un dato.
 */

const VISTO_KEY = 'serrano.asistencia.aviso';

/** Cada cuanto se vuelve a preguntar por el estado, como mucho. */
const REFRESCO_MS = 60_000;

/**
 * El dia en que cada persona ya vio el aviso, por si el portatil es de la
 * oficina y lo usan dos. Se guarda por usuario y se limpia solo: lo de ayer no
 * le importa a nadie.
 */
function avisoVisto(userId: string): boolean {
  try {
    const raw = localStorage.getItem(VISTO_KEY);
    const dias = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return dias[userId] === bogotaToday();
  } catch {
    return false;
  }
}

function marcarAvisoVisto(userId: string): void {
  try {
    // Se reescribe solo con lo de hoy: asi la clave no crece con un dia por
    // cada persona que haya pasado por este navegador.
    localStorage.setItem(VISTO_KEY, JSON.stringify({ [userId]: bogotaToday() }));
  } catch {
    // Navegacion privada. Como mucho, el aviso sale otra vez: molesto, no roto.
  }
}

export function AttendanceReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [pendiente, setPendiente] = useState(false);
  const [interrumpe, setInterrumpe] = useState(false);
  // En una ref y no en estado: es el reloj de la ultima consulta, no algo que
  // se pinte. En estado provocaria un render por consulta y, peor, dejaria el
  // valor viejo dentro del efecto que lo mira.
  const ultimaConsulta = useRef(0);

  /*
    Al administrador no se le recuerda nada: no ficha. Y en la propia pantalla
    de asistencia sobra el aviso — ya esta donde tiene que estar, y taparle el
    boton de marcar con un cartel que dice "marca" seria una broma.
  */
  const aplica = !!user && user.role !== 'ADMIN';
  const enLaPantalla = pathname.startsWith('/asistencia');

  const consultar = useCallback(async () => {
    if (!user) return;
    try {
      const estado = await attendance.today();

      /*
        "Le falta marcar" no es "hoy no tiene marcas": quien entro anoche a las
        once y sigue dentro no tiene ninguna marca de hoy y no le falta nada.
        Por eso se miran las dos cosas.
      */
      const falta =
        !estado.working && !estado.marks.some((m) => m.type === 'IN');


      setPendiente(falta);
      if (falta && !avisoVisto(user.id)) {
        setInterrumpe(true);
        marcarAvisoVisto(user.id);
      }
    } catch {
      // Si la consulta falla no se inventa nada: sin respuesta no hay aviso.
      // Dar la lata por un error de red seria peor que callarse.
      setPendiente(false);
    } finally {
      ultimaConsulta.current = Date.now();
    }
  }, [user]);

  /*
    Se vuelve a preguntar al cambiar de pantalla y al volver a la pestaña, con
    un minuto de guarda: si ficha desde el movil, el portatil deja de dar la
    lata en cuanto se mire, sin convertir cada clic del panel en una peticion.
  */
  useEffect(() => {
    if (!aplica) return;
    if (Date.now() - ultimaConsulta.current < REFRESCO_MS) return;
    void consultar();
  }, [aplica, pathname, consultar]);

  useEffect(() => {
    if (!aplica) return;
    const alVolver = () => {
      if (document.visibilityState === 'visible') void consultar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [aplica, consultar]);

  if (!aplica || !pendiente || enLaPantalla) return null;

  const irAMarcar = () => {
    setInterrumpe(false);
    void navigate('/asistencia');
  };

  if (interrumpe) {
    return (
      <Modal
        title="Marca tu entrada"
        onClose={() => setInterrumpe(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setInterrumpe(false)}>
              Ahora no
            </Button>
            <Button onClick={irAMarcar}>Marcar entrada</Button>
          </>
        }
      >
        <p className="text-sm">
          Todavía no has marcado tu entrada de hoy. Se hace en un momento y
          necesita tu ubicación.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Si lo dejas para luego, el recordatorio se queda abajo hasta que marques.
        </p>
      </Modal>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-lg border bg-background px-3.5 py-2.5 shadow-lg sm:inset-x-auto sm:left-4 sm:max-w-sm">
      <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px]">Sin marcar entrada hoy.</span>
      <Button size="sm" onClick={irAMarcar}>
        Marcar
      </Button>
      {/*
        Esconde la pastilla hasta la siguiente consulta del estado —cambiar de
        pantalla, volver a la pestaña—, no hasta mañana: la X esta para poder
        leer lo que la pastilla tape, no para silenciar el recordatorio.
      */}
      <button
        type="button"
        aria-label="Ocultar recordatorio"
        onClick={() => setPendiente(false)}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
