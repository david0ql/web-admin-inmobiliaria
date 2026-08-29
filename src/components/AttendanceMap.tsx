import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

import {
  accuracyLabel,
  dayShort,
  hasPoint,
  looseAccuracy,
  sessionKey,
  type TeamMark,
  type TeamSession,
} from '../lib/attendance';

/**
 * El mapa de la historia de asistencia.
 *
 * Carga Leaflet —150 kB mas las teselas de OpenStreetMap— asi que la pantalla
 * lo importa con `lazy()`: quien nunca abre la historia no se lo descarga. Es
 * el mismo montaje que el sitio publico (web-sell/src/components/property/
 * property-map-canvas.tsx): Leaflet a pelo dentro de un `useEffect`, sin
 * envoltorio de React, porque el mapa manda sobre su propio DOM y meter un
 * arbol de componentes en medio solo añade una capa que se desincroniza.
 *
 * Lo que se dibuja de cada jornada:
 *
 *   - Dos marcas, entrada y salida, distintas por forma, color y simbolo. Por
 *     las tres a la vez y no solo por color: quien no distingue verde de azul
 *     tiene que poder leer el mapa igual.
 *   - La linea que las une, para que se lea que son la misma jornada y no
 *     cuatro chinchetas sueltas.
 *   - Un circulo del radio que dio el GPS. Es el dato mas facil de olvidar y el
 *     que mas cambia la conclusion: una marca con ±300 m no dice que alguien
 *     estuviera en la oficina, dice que estaba en el barrio.
 */

/** Entrada y salida se separan por tono y por simbolo, nunca solo por tono. */
const VERDE = '#2f7d4f';
const AZUL = '#1d4ed8';

/** Bucaramanga. Solo se usa mientras no hay ningun punto que encuadrar. */
const BUCARAMANGA: L.LatLngExpression = [7.1193, -73.1227];

interface Props {
  sessions: TeamSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * La chincheta.
 *
 * La entrada es un circulo con la flecha hacia dentro; la salida, un rombo con
 * la flecha hacia fuera. El SVG es constante —no entra en el ningun dato— asi
 * que va como cadena sin riesgo.
 */
function chincheta(tipo: 'entrada' | 'salida', activa: boolean): L.DivIcon {
  const color = tipo === 'entrada' ? VERDE : AZUL;
  const lado = activa ? 30 : 24;
  const flecha =
    tipo === 'entrada'
      ? '<path d="M12 6v8m0 0 3-3m-3 3-3-3" />'
      : '<path d="M12 18v-8m0 0 3 3m-3-3-3 3" />';

  return L.divIcon({
    className: '',
    html:
      `<span class="marca-asistencia${activa ? ' marca-asistencia--activa' : ''}"` +
      ` style="--marca:${color};width:${lado}px;height:${lado}px;` +
      `border-radius:${tipo === 'entrada' ? '50%' : '22%'}">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"` +
      ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${flecha}</svg>` +
      '</span>',
    iconSize: [lado, lado],
    iconAnchor: [lado / 2, lado / 2],
    popupAnchor: [0, -lado / 2],
  });
}

/** La hora de una marca, dicha entera y sin ambiguedad de zona. */
function cuando(mark: TeamMark): string {
  return `${dayShort(mark.date)}, ${mark.time} (hora de Colombia)`;
}

/**
 * El globo de una marca.
 *
 * Se construye con nodos del DOM y no con una cadena de HTML: el nombre de la
 * persona y la direccion vienen de la base de datos, y concatenarlos dentro de
 * `innerHTML` seria meter texto ajeno en el documento.
 */
function globo(mark: TeamMark, tipo: 'entrada' | 'salida'): HTMLElement {
  const root = document.createElement('div');
  root.className = 'globo-asistencia';

  const quien = document.createElement('strong');
  quien.textContent = mark.agentName;
  root.append(quien);

  const que = document.createElement('span');
  que.className = 'globo-asistencia__tipo';
  que.style.color = tipo === 'entrada' ? VERDE : AZUL;
  que.textContent = tipo === 'entrada' ? 'Marcó entrada' : 'Marcó salida';
  root.append(que);

  const instante = document.createElement('span');
  instante.textContent = cuando(mark);
  root.append(instante);

  if (mark.address) {
    const donde = document.createElement('span');
    donde.className = 'globo-asistencia__dir';
    donde.textContent = mark.address;
    root.append(donde);
  }

  const suelta = looseAccuracy(mark);
  const cuanto = document.createElement('span');
  cuanto.className = suelta
    ? 'globo-asistencia__aviso'
    : 'globo-asistencia__dir';
  cuanto.textContent = suelta
    ? `Precisión ${accuracyLabel(mark)}: el punto sitúa la zona, no el edificio`
    : `Precisión ${accuracyLabel(mark)}`;
  root.append(cuanto);

  return root;
}

export function AttendanceMap({ sessions, selectedId, onSelect }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  /** La chincheta de cada jornada, para abrir su globo al elegirla en la lista. */
  const anclas = useRef<Map<string, L.Marker>>(new Map());
  /**
   * Sobre que mapa y con que lista se encuadro la ultima vez.
   *
   * Distingue las dos razones por las que hay que redibujar: cambiaron los
   * filtros —y entonces el mapa vuelve a encuadrar— o cambio la jornada elegida
   * —y entonces solo cambia el realce, porque reencuadrar sobre la lista entera
   * le quitaria al usuario el zoom que acaba de hacer—.
   *
   * Y guarda el mapa, no solo la lista: en desarrollo `StrictMode` monta,
   * desmonta y vuelve a montar, asi que el segundo mapa nace con el zoom
   * inicial y la MISMA lista. Comparando solo la lista, ese mapa se quedaba sin
   * encuadrar y enseñaba media Santander en vez de las marcas.
   */
  const encuadrado = useRef<{ map: L.Map; sessions: TeamSession[] } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // El mapa se crea una sola vez. Recrearlo al cambiar los filtros perderia el
  // encuadre que el usuario acaba de hacer con la rueda.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const map = L.map(contenedor.current, {
      center: BUCARAMANGA,
      zoom: 13,
      // La pantalla tiene lista debajo: sin esto, bajar con la rueda se queda
      // atrapado haciendo zoom al pasar por encima del mapa.
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    capa.current = L.layerGroup().addTo(map);
    mapa.current = map;

    // El Map de chinchetas se copia a una local para la limpieza: leer
    // `anclas.current` al desmontar es leerlo mas tarde de lo que se cree.
    const chinchetas = anclas.current;
    return () => {
      map.remove();
      mapa.current = null;
      capa.current = null;
      chinchetas.clear();
    };
  }, []);

  // Las capas se rehacen enteras: son las jornadas de un rango de fechas, no un
  // historico, y reconciliar marca por marca costaria mas codigo del que ahorra.
  useEffect(() => {
    const map = mapa.current;
    const grupo = capa.current;
    if (!map || !grupo) return;

    grupo.clearLayers();
    anclas.current.clear();

    const puntos: L.LatLngExpression[] = [];

    for (const session of sessions) {
      const clave = sessionKey(session);
      const activa = clave === selectedId;
      const entrada = hasPoint(session.checkIn) ? session.checkIn : null;
      const salida = hasPoint(session.checkOut) ? session.checkOut : null;

      const pintar = (mark: TeamMark | null, tipo: 'entrada' | 'salida') => {
        if (!mark) return null;
        const punto: L.LatLngExpression = [
          Number(mark.latitude),
          Number(mark.longitude),
        ];
        puntos.push(punto);

        // El circulo va antes que la chincheta para que quede por debajo.
        if (mark.accuracyM && mark.accuracyM > 1) {
          /*
            Los dos circulos no pesan igual a proposito. El de una marca fiable
            es un radio de diez metros: casi un punto, y se dibuja flojo para no
            ensuciar el mapa. El de una marca mala es lo que hay que ver —dice
            que la persona podia estar en cualquier sitio de esa mancha— asi
            que va con trazo grueso, discontinuo y relleno: si esto se lee
            flojo, quien mira concluye de mas.
          */
          const suelta = looseAccuracy(mark);
          L.circle(punto, {
            radius: mark.accuracyM,
            color: tipo === 'entrada' ? VERDE : AZUL,
            weight: suelta ? 2 : 1,
            dashArray: suelta ? '5 4' : undefined,
            fillOpacity: suelta ? 0.18 : activa ? 0.12 : 0.07,
            opacity: suelta ? 0.95 : activa ? 0.7 : 0.45,
            interactive: false,
          }).addTo(grupo);
        }

        return L.marker(punto, {
          icon: chincheta(tipo, activa),
          riseOnHover: true,
          // Leaflet le pone role="button": sin titulo queda mudo para un lector
          // de pantalla.
          title: `${mark.agentName} — ${tipo} ${dayShort(mark.date)} ${mark.time}`,
          zIndexOffset: activa ? 1000 : 0,
        })
          .bindPopup(globo(mark, tipo))
          .on('click', () => onSelectRef.current(clave))
          .addTo(grupo);
      };

      const chinchetaEntrada = pintar(entrada, 'entrada');
      const chinchetaSalida = pintar(salida, 'salida');
      // El globo se abre por la entrada, que es donde empieza la jornada; si no
      // la hay —una salida cuya entrada quedo fuera del rango— por la salida.
      const ancla = chinchetaEntrada ?? chinchetaSalida;
      if (ancla && clave) anclas.current.set(clave, ancla);

      // La linea solo existe si existen los dos extremos: una jornada abierta
      // no tiene a donde llegar, y dibujarle un tramo seria inventarselo.
      if (entrada && salida) {
        L.polyline(
          [
            [Number(entrada.latitude), Number(entrada.longitude)],
            [Number(salida.latitude), Number(salida.longitude)],
          ],
          {
            color: activa ? '#14161a' : '#6b7280',
            weight: activa ? 3 : 2,
            opacity: activa ? 0.9 : 0.45,
            dashArray: activa ? undefined : '6 6',
            interactive: false,
          },
        ).addTo(grupo);
      }
    }

    const hayQueEncuadrar =
      encuadrado.current?.map !== map || encuadrado.current?.sessions !== sessions;
    encuadrado.current = { map, sessions };

    if (puntos.length && hayQueEncuadrar) {
      // Poco margen: el encuadre se calcula sobre TODOS los puntos filtrados y
      // un padding generoso, con dos marcas en extremos de la ciudad, deja la
      // mitad del lienzo en monte.
      map.fitBounds(L.latLngBounds(puntos).pad(0.08), { maxZoom: 16 });
    }
  }, [sessions, selectedId]);

  // Encuadre y globo de la jornada elegida. Va despues del redibujado, que es
  // quien crea las chinchetas nuevas.
  useEffect(() => {
    const map = mapa.current;
    if (!map || !selectedId) return;

    const session = sessions.find((s) => sessionKey(s) === selectedId);
    if (!session) return;

    const puntos: L.LatLngExpression[] = [];
    for (const mark of [session.checkIn, session.checkOut]) {
      if (hasPoint(mark)) {
        puntos.push([Number(mark.latitude), Number(mark.longitude)]);
      }
    }
    if (!puntos.length) return;

    if (puntos.length === 1) map.setView(puntos[0], Math.max(map.getZoom(), 16));
    else map.fitBounds(L.latLngBounds(puntos).pad(0.15), { maxZoom: 17 });

    anclas.current.get(selectedId)?.openPopup();
  }, [selectedId, sessions]);

  return (
    <div
      ref={contenedor}
      role="application"
      aria-label="Mapa de las marcas de entrada y salida"
      className="size-full"
    />
  );
}
