import type { Portal } from './api';

/**
 * Sincronizacion con portales: lo que devuelve la API y como se nombra en
 * pantalla. Aparte de `api.ts` porque solo lo usan la ficha del inmueble y la
 * pantalla de Portales.
 */

export type SyncState = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'PAUSED' | 'REMOVED';

export interface PortalSyncRow {
  id: string | null;
  portalId: number;
  portal: Portal;
  /** Nulo: el portal esta conectado pero el inmueble nunca se envio. */
  state: SyncState | null;
  connected: boolean;
  mode: 'push' | 'feed' | null;
  outdated: boolean;
  externalId?: string | null;
  externalUrl?: string | null;
  note?: string | null;
  lastError?: string | null;
  lastSyncedAt?: string | null;
  publishedAt?: string | null;
  pendingAction?: 'UPSERT' | 'REMOVE' | null;
  nextAttemptAt?: string | null;
}

export interface PortalSync {
  publishable: boolean;
  blockers: string[];
  publications: PortalSyncRow[];
}

export interface ConnectorField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  help?: string;
}

export interface PortalConnection {
  portalId: number;
  portal: Portal;
  connector: string;
  mode: 'push' | 'feed' | null;
  instructions: string | null;
  enabled: boolean;
  autoPublishNew: boolean;
  sandbox: boolean;
  credentials: (ConnectorField & { filled: boolean })[];
  settings: (ConnectorField & { value: string })[];
  feedUrl: string | null;
  callbackUrl: string | null;
  secretKeyConfigured: boolean;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
}

export interface LocationMapping {
  id: string;
  externalId: string;
  externalName: string;
  extra: Record<string, string>;
  verified: boolean;
}

export interface LocationsOverview {
  cities: { cityId: number; cityName: string; properties: number; mapping: LocationMapping | null }[];
  zones: {
    cityId: number;
    cityName: string;
    zoneId: number;
    zoneName: string;
    properties: number;
    mapping: LocationMapping | null;
  }[];
}

export interface RemoteLocation {
  id: string;
  name: string;
  type: string;
  city: string | null;
  state: string | null;
  extra?: Record<string, string>;
}

/** Conectores que piden emparejar barrios. */
export const NEEDS_LOCATIONS = new Set(['fincaraiz', 'metrocuadrado']);

export const SYNC_LABEL: Record<SyncState, string> = {
  PENDING: 'En proceso',
  PUBLISHED: 'Publicado',
  REJECTED: 'Rechazado',
  PAUSED: 'Pausado',
  REMOVED: 'Retirado',
};

export const SYNC_TONE: Record<SyncState, 'green' | 'red' | 'amber' | 'neutral'> = {
  PENDING: 'amber',
  PUBLISHED: 'green',
  REJECTED: 'red',
  PAUSED: 'neutral',
  REMOVED: 'neutral',
};
