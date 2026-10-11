/*
  Catalogo de componentes — entrada SOLO de desarrollo.

  No entra en el router del panel: es una pagina aparte de Vite, para que
  enseñar la biblioteca no suponga añadir una ruta a la aplicacion real.
  Importa los componentes DE VERDAD desde `components/ui`, asi que lo que se ve
  aqui es exactamente lo que ve el equipo en el panel.
*/
import { createRoot } from 'react-dom/client'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'

import './index.css'
import {
  Alert, Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Loading,
  PageBody, PasswordField, Pager, SectionHeading, SelectField, Stat, Table, TBody,
  Td, TextareaField, Th, THead, Timeline, TimelineItem, Tr, CheckField,
  Skeleton, TagBadge,
} from './components/ui'

const TOKENS = [
  ['--background', 'Fondo de la aplicación'],
  ['--foreground', 'Texto principal'],
  ['--primary', 'Acción principal y rail de navegación'],
  ['--primary-foreground', 'Texto sobre el color principal'],
  ['--secondary', 'Fondos suaves: cabeceras de tabla, hover'],
  ['--muted-foreground', 'Texto secundario'],
  ['--destructive', 'Error y acciones destructivas'],
  ['--border', 'Bordes y separadores'],
  ['--input', 'Borde de los campos'],
  ['--ring', 'Anillo de foco'],
]

function Bloque({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section className="border-t py-8">
      <h2 className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">{titulo}</h2>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">{nota}</p>
      {children}
    </section>
  )
}

function Pieza({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">{nombre}</p>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  )
}

function Catalogo() {
  return (
    <PageBody>
      <div className="mx-auto max-w-5xl">
        <SectionHeading as="h1" light="Catálogo de" strong="componentes" />
        <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">
          Las piezas con las que está construido el panel. Son los componentes
          reales de <code>src/components/ui</code>: cualquier cambio en ellos se
          refleja aquí.
        </p>

        <Bloque titulo="Color" nota="Declarados una vez como variables CSS en index.css. El panel y el sitio público comparten la misma paleta, por eso se parecen.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {TOKENS.map(([token, uso]) => (
              <div key={token} className="overflow-hidden rounded-md border">
                <div className="h-14 border-b" style={{ background: `var(${token})` }} />
                <div className="p-2">
                  <p className="font-mono text-[10px]">{token}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{uso}</p>
                </div>
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque titulo="Cifras y encabezados" nota="Stat es la tarjeta de cifra del panel: rótulo pequeño, número grande tabular y una nota al pie que cambia de color según lo que diga.">
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Inventario" value="645" note="619 disponibles" tone="green" />
            <Stat label="Valor en cartera" value="$312 MM" note="media $495 M" />
            <Stat label="Clientes abiertos" value="5.559" note="5.556 sin contacto" tone="red" />
            <Stat label="Citas esta semana" value="0" note="0 hoy" tone="amber" />
          </div>
        </Bloque>

        <Bloque titulo="Botones" nota="Siete variantes. «overlay» es el único que no se usa sobre fondo claro: aparece encima de una foto al pasar el ratón.">
          <Pieza nombre="variant">
            <Button>Principal</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </Pieza>
          <Pieza nombre="size · con icono · deshabilitado">
            <Button size="sm">Pequeño</Button>
            <Button size="lg">Grande</Button>
            <Button size="icon" aria-label="Buscar"><Search /></Button>
            <Button><Plus /> Nuevo inmueble</Button>
            <Button variant="outline"><Pencil /> Editar</Button>
            <Button variant="destructive"><Trash2 /> Eliminar</Button>
            <Button disabled>Deshabilitado</Button>
          </Pieza>
        </Bloque>

        <Bloque titulo="Campos de formulario" nota="Field envuelve etiqueta, campo y pista. Las pantallas nunca montan un input suelto: así todos los formularios del panel miden y se alinean igual.">
          <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Buscar" placeholder="Título, dirección o código" />
            <Field label="Con pista" hint="Lo ve el propietario en su portal." defaultValue="Cabecera" />
            <SelectField label="Ciudad" defaultValue="">
              <option value="">Todas</option>
              <option value="1">Bucaramanga</option>
            </SelectField>
            <PasswordField label="Contraseña" required />
            <Field label="Deshabilitado" placeholder="No editable" disabled />
            <TextareaField label="Descripción" placeholder="Texto del anuncio." />
            <CheckField label="Sin contacto en 30 días" />
          </div>
        </Bloque>

        <Bloque titulo="Etiquetas" nota="Badge lleva un tono de los que conocemos; cuando el color viene de la API —las etapas del embudo— se pasa como color y se dibuja con un punto.">
          <Pieza nombre="tone">
            <Badge>neutral</Badge>
            <Badge tone="green">green</Badge>
            <Badge tone="amber">amber</Badge>
            <Badge tone="red">red</Badge>
            <Badge tone="blue">blue</Badge>
            <Badge tone="ink">ink</Badge>
          </Pieza>
          <Pieza nombre="color de dato · TagBadge">
            <Badge color="#16a34a">Convertido</Badge>
            <Badge color="#ca8a04">En proceso</Badge>
            <TagBadge color="#0d0d0d">NUEVA</TagBadge>
          </Pieza>
        </Bloque>

        <Bloque titulo="Tablas" nota="La tabla es la pieza central del panel: inventario, cartera, solicitudes y reportes son todos la misma tabla. «num» alinea a la derecha y pone cifras tabulares.">
          <Card title="Inventario por ciudad" flush className="w-full">
            <Table>
              <THead>
                <tr><Th>Ciudad</Th><Th num>Total</Th><Th num>Disponibles</Th><Th num>Precio medio</Th></tr>
              </THead>
              <TBody>
                <Tr><Td>Bucaramanga</Td><Td num>285</Td><Td num>268</Td><Td num>$546 M</Td></Tr>
                <Tr><Td>Piedecuesta</Td><Td num>135</Td><Td num>131</Td><Td num>$341 M</Td></Tr>
                <Tr><Td>Floridablanca</Td><Td num>129</Td><Td num>128</Td><Td num>$681 M</Td></Tr>
              </TBody>
            </Table>
          </Card>
          <div className="mt-4 w-full">
            <Pager page={1} pages={52} total={619} unit="inmuebles" onPage={() => {}} />
          </div>
        </Bloque>

        <Bloque titulo="Estados de la pantalla" nota="Cargando, vacío y error: las tres respuestas que una pantalla puede dar además del dato. Cada una tiene su pieza para que todas las pantallas respondan igual.">
          <div className="grid w-full gap-4 lg:grid-cols-3">
            <div><p className="mb-2 font-mono text-[11px] text-muted-foreground">Loading</p><Loading rows={3} /></div>
            <div><p className="mb-2 font-mono text-[11px] text-muted-foreground">Empty</p>
              <Empty title="Sin resultados">Prueba a quitar algún filtro.</Empty></div>
            <div><p className="mb-2 font-mono text-[11px] text-muted-foreground">ErrorNote · Alert</p>
              <ErrorNote onRetry={() => {}}>No se pudo cargar el inventario.</ErrorNote>
              <div className="mt-2 space-y-2">
                <Alert tone="warn">Hay 2 solicitudes sin revisar.</Alert>
                <Alert tone="ok">Los cambios se guardaron.</Alert>
              </div>
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Otras piezas" nota="Avatar para personas, Timeline para la bitácora de un cliente y Skeleton para el hueco de lo que todavía no ha llegado.">
          <Pieza nombre="Avatar">
            <Avatar name="Ana Ejemplo" />
            <Avatar name="David Gómez" />
          </Pieza>
          <Pieza nombre="Timeline">
            <div className="w-full max-w-md">
              <Timeline>
                <TimelineItem>
                  <p className="text-sm font-medium">Llamada</p>
                  <p className="text-xs text-muted-foreground">hace 2 días · Ana</p>
                  <p className="mt-1 text-sm">Interesada en Cañaveral.</p>
                </TimelineItem>
                <TimelineItem>
                  <p className="text-sm font-medium">Visita agendada</p>
                  <p className="text-xs text-muted-foreground">hace 5 días · Ana</p>
                  <p className="mt-1 text-sm">Apartamento 9870517.</p>
                </TimelineItem>
              </Timeline>
            </div>
          </Pieza>
          <Pieza nombre="Skeleton">
            <div className="w-64 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </Pieza>
        </Bloque>
      </div>
    </PageBody>
  )
}

createRoot(document.getElementById('root')!).render(<Catalogo />)
