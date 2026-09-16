import { useEffect, useState } from 'react';
import { Check, Clock3, X } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { PageHeader } from '../components/Shell';
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, PageBody } from '../components/ui';
import { date } from '../lib/format';

interface ChangeRequest {
  id: string; propertyId: string; clientId: string;
  action: 'UPDATE' | 'ARCHIVE'; status: 'PENDING' | 'APPROVED' | 'APPLIED' | 'REJECTED';
  beforeValues: Record<string, unknown>; afterValues: Record<string, unknown>;
  resolution: string | null; applyAfter: string | null; createdAt: string;
}
interface Settings { id: string; propagationMinutes: number }

const LABEL: Record<string, string> = {
  address: 'Dirección', salePrice: 'Precio de venta', rentPrice: 'Canon',
  maintenanceFee: 'Administración', area: 'Área', builtArea: 'Área construida',
  privateArea: 'Área privada', bedrooms: 'Alcobas', bathrooms: 'Baños',
  garages: 'Garajes', archived: 'Archivar',
};

export function PropertyChanges() {
  const requests = useFetch<ChangeRequest[]>((signal) => api.get('/property-changes', undefined, signal), []);
  const settings = useFetch<Settings>((signal) => api.get('/property-changes/settings/propagation', undefined, signal), []);
  const [minutes, setMinutes] = useState('5');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (settings.data) setMinutes(String(settings.data.propagationMinutes)); }, [settings.data]);

  const review = async (id: string, approved: boolean) => {
    setBusy(id);
    try {
      await api.patch(`/property-changes/${id}/review`, { approved });
      requests.reload();
    } finally { setBusy(null); }
  };
  const saveSettings = async () => {
    setBusy('settings');
    try {
      await api.patch('/property-changes/settings/propagation', { propagationMinutes: Number(minutes) });
      settings.reload();
    } finally { setBusy(null); }
  };

  return <>
    <PageHeader eyebrow="Portal de propietarios" title="Cambios de inmuebles" />
    <PageBody>
      <Card title="Propagación después de aprobar" className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Espera configurable (minutos)" type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="sm:w-64" />
          <Button onClick={() => void saveSettings()} loading={busy === 'settings'}>Guardar periodo</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">La inactivación pedida por el propietario sigue siendo inmediata. Ediciones y archivos se aplican después de esta espera.</p>
      </Card>
      {requests.error && <ErrorNote>{requests.error}</ErrorNote>}
      {requests.loading ? <Loading /> : !requests.data?.length ? <Empty title="No hay solicitudes">Los cambios enviados desde Mi cuenta aparecerán aquí.</Empty> : (
        <div className="grid gap-4">
          {requests.data.map((request) => (
            <Card key={request.id} title={<div className="flex flex-wrap items-center gap-2"><span>{String(request.beforeValues.title ?? 'Inmueble')}</span><Badge tone={request.status === 'PENDING' ? 'amber' : request.status === 'REJECTED' ? 'red' : 'green'}>{request.status}</Badge><Badge tone="neutral">{request.action}</Badge></div>}>
              <p className="mb-4 text-xs text-muted-foreground">{date(request.createdAt)} · Inmueble {String(request.beforeValues.code ?? request.propertyId)}</p>
              <div className="overflow-hidden rounded-lg border">
                {Object.entries(request.afterValues).map(([key, after]) => (
                  <div key={key} className="grid grid-cols-[8rem_1fr_1fr] gap-3 border-b px-3 py-2 text-sm last:border-0">
                    <strong>{LABEL[key] ?? key}</strong>
                    <span className="text-muted-foreground line-through">{String(request.beforeValues[key] ?? '—')}</span>
                    <span className="font-medium">{String(after ?? '—')}</span>
                  </div>
                ))}
              </div>
              {request.status === 'PENDING' && <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => void review(request.id, false)} disabled={busy === request.id}><X />Rechazar</Button><Button onClick={() => void review(request.id, true)} loading={busy === request.id}><Check />Aprobar</Button></div>}
              {request.status === 'APPROVED' && request.applyAfter && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-4" />Se aplicará después de {date(request.applyAfter)}</p>}
            </Card>
          ))}
        </div>
      )}
    </PageBody>
  </>;
}
