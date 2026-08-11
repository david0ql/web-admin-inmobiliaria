/**
 * Cliente HTTP de la API.
 *
 * Resuelve dos cosas que si se dejan a cada pantalla acaban mal: la renovacion
 * del access token (que caduca a los 15 minutos, en mitad de cualquier
 * formulario) y el mensaje de error, que la API ya devuelve escrito para el
 * usuario y aqui solo hay que dejar pasar.
 */

const BASE = '/api/v1';
const ACCESS_KEY = 'serrano.access';
const REFRESH_KEY = 'serrano.refresh';

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Se avisa a la app cuando la sesion muere para que vuelva al acceso. */
type Listener = () => void;
const expiredListeners = new Set<Listener>();
export function onSessionExpired(fn: Listener) {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}

function sessionExpired() {
  tokens.clear();
  expiredListeners.forEach((fn) => fn());
}

/**
 * Una sola renovacion en vuelo: si caducan a la vez seis peticiones de una
 * pantalla, no deben disparar seis rotaciones — la segunda invalidaria a la
 * primera y cerraria la sesion.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;

  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as Session;
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      // Se libera en el siguiente tick para que los que esperaban lean ya el
      // token nuevo.
      setTimeout(() => (refreshing = null), 0);
    }
  })();

  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

function toQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function send<T>(path: string, options: RequestOptions, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const access = tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${BASE}${path}${toQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (res.status === 401 && retry && tokens.refresh) {
    if (await refreshSession()) return send<T>(path, options, false);
    sessionExpired();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const body = data as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join('. ')
      : (body?.message ?? `Error ${res.status}`);
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

/**
 * Descarga un fichero que exige sesión.
 *
 * Un `<a href>` no lleva la cabecera `Authorization`, así que para lo que está
 * detrás de autenticación no vale: hay que pedirlo con `fetch`, tener el
 * contenido en memoria y provocar la descarga desde ahí.
 */
export async function download(path: string, filename: string): Promise<void> {
  const access = tokens.access;
  const res = await fetch(`${BASE}${path}`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'No se pudo descargar el documento');
  }

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Sin esto el blob se queda en memoria hasta que se recargue la pestaña.
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) =>
    send<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
};

// --- tipos del dominio -----------------------------------------------------

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: string | number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    photoUrl: string | null;
    mustSetPassword: boolean;
  };
}

export type Role = 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  photoUrl: string | null;
  cellPhone: string | null;
  hasWhatsapp: boolean;
  mustSetPassword: boolean;
  lastLoginAt: string | null;
}

export interface Page<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number; hasNext: boolean };
}

export interface Agent {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName?: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  photoUrl: string | null;
  cellPhone: string | null;
  hasWhatsapp: boolean;
  mustSetPassword: boolean;
  lastLoginAt: string | null;
}

export interface Shift {
  id: string;
  agentId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  kind: 'OFFICE' | 'ON_CALL';
}

export interface Named {
  id: number;
  name: string;
}

export interface City extends Named {
  regionId: number;
}

export interface Zone extends Named {
  cityId: number;
}

export interface Feature extends Named {
  scope: 'INTERNAL' | 'EXTERNAL';
}

export interface Currency {
  id: number;
  iso: string;
  name: string;
}

export interface Portal extends Named {
  paid: boolean;
  connected: boolean;
}

export interface Catalogs {
  propertyTypes: (Named & { active: boolean })[];
  features: Feature[];
  currencies: Currency[];
  clientTypes: Named[];
  portals: Portal[];
  cities: City[];
}

export type Availability = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RENTED' | 'WITHDRAWN';
export type PublicationStatus = 'DRAFT' | 'ACTIVE' | 'OUTSTANDING' | 'INACTIVE';
export type PropertyCondition = 'NEW' | 'USED' | 'PROJECT' | 'UNDER_CONSTRUCTION';

export interface PropertyImage {
  id: string;
  url: string;
  urlLarge: string | null;
  position: number;
  isMain: boolean;
  description: string | null;
}

export interface PropertyLabel {
  id: string;
  name: string;
  color: string;
}

export type FamilyKind = 'PROJECT' | 'COMPLEX' | 'BUILDING' | 'STAGE';
export type FamilyStatus = 'PLANNED' | 'UNDER_CONSTRUCTION' | 'DELIVERED' | 'SOLD_OUT';

export interface PropertyFamily {
  id: string;
  name: string;
  slug: string;
  kind: FamilyKind;
  status: FamilyStatus;
  description: string | null;
  developer: string | null;
  city: City | null;
  cityId: number | null;
  zone: Zone | null;
  zoneId: number | null;
  address: string | null;
  deliveryYear: number | null;
  totalUnits: number | null;
  coverUrl: string | null;
  published: boolean;
  parentId: string | null;
  children?: PropertyFamily[];
  createdAt: string;
}

export interface UnitTypeSummary {
  unitType: string | null;
  propertyType: string;
  units: number;
  available: number;
  minArea: number | null;
  maxArea: number | null;
  bedrooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

export type ConsignmentStatus =
  | 'NEW'
  | 'REVIEWING'
  | 'VISIT_SCHEDULED'
  | 'ACCEPTED'
  | 'REJECTED';

export type ConsignmentDocumentType =
  | 'TRADITION'
  | 'DEED'
  | 'OWNER_ID'
  | 'PROPERTY_TAX'
  | 'MAINTENANCE_BILL';

export interface ConsignmentFile {
  kind: 'DOCUMENT' | 'PHOTO';
  /** Solo en documentos, y ausente en los que se subieron sin categoría. */
  docType?: ConsignmentDocumentType;
  storageKey: string;
  url: string;
  originalName: string;
  bytes: number;
}

export interface ConsignmentRequest {
  id: string;
  reference: string;
  status: ConsignmentStatus;
  cityId: number | null;
  cityName: string;
  commune: string | null;
  neighborhood: string;
  complexName: string;
  address: string;
  unitNumber: string;
  stratum: number;
  propertyTypeId: number | null;
  propertyTypeName: string;
  floor: string | null;
  view: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | null;
  hasElevator: boolean;
  condition: string;
  privateArea: string | null;
  builtArea: string;
  lotArea: string | null;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  hasStorageRoom: boolean;
  buildingYear: number;
  amenityIds: number[];
  amenitiesOther: string | null;
  maintenanceFee: string;
  salePrice: string;
  creditType: 'MORTGAGE' | 'LEASING' | 'DEBT_FREE';
  creditInstitution: string | null;
  debtAmount: string | null;
  occupancy: 'RENTED' | 'VACANT' | 'OWNER_OCCUPIED';
  rentAmount: string | null;
  leaseEndsOn: string | null;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  notes: string | null;
  files: ConsignmentFile[];
  requestedVisitAt: string | null;
  propertyId: string | null;
  clientId: string | null;
  resolution: string | null;
  createdAt: string;
}

// --- consultas de credito ---------------------------------------------------

export type CreditRequestStatus =
  | 'NEW'
  | 'REVIEWING'
  | 'SUBMITTED'
  | 'PREAPPROVED'
  | 'REJECTED'
  | 'DROPPED';

export type DocumentType = 'CC' | 'CE' | 'PASSPORT' | 'NIT';
export type OccupationType = 'SALARIED' | 'PENSIONER' | 'SELF_EMPLOYED';
export type Gender = 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';

export interface CoApplicant {
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  documentType: DocumentType;
  documentNumber: string;
  gender: Gender | null;
  occupation: OccupationType;
  monthlyIncome: string | null;
}

export interface CreditRequest {
  id: string;
  reference: string;
  status: CreditRequestStatus;

  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  documentType: DocumentType;
  documentNumber: string;
  gender: Gender | null;

  occupation: OccupationType;
  monthlyIncome: string | null;

  portfolioType: 'VIS' | 'NON_VIS';
  housingType: 'NEW' | 'USED';
  product: 'MORTGAGE' | 'HOUSING_LEASING';
  termYears: number;
  workCityName: string;
  amount: string;

  hasPropertyPicked: boolean;
  propertyValue: string | null;
  propertyCode: string | null;
  propertyId: string | null;

  coApplicant: CoApplicant | null;

  notes: string | null;
  acceptedTermsAt: string;

  clientId: string | null;
  assignedAgentId: string | null;
  reviewedAt: string | null;
  institution: string | null;
  resolution: string | null;
  createdAt: string;
}

export interface Property {
  id: string;
  code: string;
  title: string;
  address: string | null;
  publicUrl: string | null;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  rentPrice: number | null;
  maintenanceFee: number | null;
  currency: Currency;
  propertyType: Named;
  city: City & { region?: { name: string; country?: { name: string } } };
  zone: Zone | null;
  latitude: number | null;
  longitude: number | null;
  area: number | null;
  builtArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  garages: number | null;
  floor: number | null;
  stratum: number | null;
  condition: PropertyCondition | null;
  buildingYear: number | null;
  observations: string | null;
  /** La descripción del asesor en inglés; la web pública la usa en /en. */
  observationsEn: string | null;
  availability: Availability;
  publicationStatus: PublicationStatus;
  label: PropertyLabel | null;
  visits: number;
  videoUrl: string | null;
  tourUrl: string | null;
  assignedAgent: Agent | null;
  assignedAgentId: string | null;
  family: PropertyFamily | null;
  familyId: string | null;
  unitType: string | null;
  images: PropertyImage[];
  features?: Feature[];
  createdAt: string;
}

export interface Publication {
  id: string;
  portalId: number;
  portal: Portal;
  state: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'PAUSED';
  publishedAt: string | null;
  externalUrl: string | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
  pipelineId: string;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  stages: PipelineStage[];
}

export interface Kanban {
  pipeline: Pipeline;
  stages: (PipelineStage & { count: number })[];
}

export interface LeadSource {
  id: string;
  name: string;
  paid: boolean;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName?: string;
  email: string | null;
  cellPhone: string | null;
  phone: string | null;
  identification: string | null;
  birthday: string | null;
  types: Named[];
  pipeline: Pipeline;
  pipelineId: string;
  stage: PipelineStage;
  stageId: string;
  stageChangedAt: string | null;
  source: LeadSource | null;
  city: City | null;
  assignedAgent: Agent | null;
  assignedAgentId: string | null;
  requirement: string | null;
  notes: string | null;
  acceptsMarketing: boolean;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InterestRole = 'PROSPECT' | 'BUYER' | 'SELLER' | 'OWNER' | 'TENANT';

export interface PropertyInterest {
  id: string;
  clientId: string;
  propertyId: string;
  role: InterestRole;
  status: 'OPEN' | 'VISITED' | 'OFFER_MADE' | 'CLOSED_WON' | 'CLOSED_LOST';
  offeredAmount: string | null;
  notes: string | null;
  property?: Property;
  client?: Client;
  createdAt: string;
}

export type AppointmentType =
  | 'VISIT'
  | 'CALL'
  | 'MEETING'
  | 'SIGNING'
  | 'PHOTO_SHOOT'
  | 'APPRAISAL';
export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'DONE'
  | 'CANCELED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  type: AppointmentType;
  status: AppointmentStatus;
  title: string;
  startsAt: string;
  endsAt: string;
  agentId: string;
  agent: Agent;
  clientId: string | null;
  client: Client | null;
  propertyId: string | null;
  property: Property | null;
  location: string | null;
  notes: string | null;
  outcome: string | null;
}

export interface CalendarPayload {
  days: { date: string; appointments: Appointment[] }[];
  shifts: Shift[];
}

export type ActivityType =
  | 'NOTE'
  | 'CALL'
  | 'WHATSAPP'
  | 'EMAIL'
  | 'VISIT'
  | 'OFFER'
  | 'STAGE_CHANGE'
  | 'ASSIGNMENT';

export interface TimelineEntry {
  kind: 'activity' | 'appointment';
  at: string;
  id: string;
  type: ActivityType | AppointmentType;
  summary: string;
  detail: string | null;
  agentId: string | null;
  automatic?: boolean;
  status?: AppointmentStatus;
  propertyId?: string | null;
}

export interface Overview {
  inventory: {
    total: number;
    available: number;
    sold: number;
    rented: number;
    published: number;
    avg_sale_price: string;
    portfolio_value: string;
    avg_area: string;
    total_visits: number;
  };
  clients: {
    total: number;
    won: number;
    lost: number;
    open: number;
    new_last_30d: number;
    stale: number;
  };
  appointments: { today: number; upcoming_7d: number; no_shows_90d: number };
}

export interface CityInventory {
  city_id: number;
  city: string;
  total: number;
  available: number;
  avg_price: string;
}

export interface TypeInventory {
  type_id: number;
  type: string;
  total: number;
  avg_price: string;
  avg_area: string;
}

export interface SourceRow {
  source: string;
  paid: boolean | null;
  total: number;
  won: number;
  lost: number;
  conversion_rate: string | null;
  new_last_30d: number;
}

export interface AgentWorkload {
  agent_id: string;
  agent: string;
  role: Role;
  status: string;
  properties: number;
  clients: number;
  open_clients: number;
  won_clients: number;
  upcoming_appointments: number;
  activities_30d: number;
}

export interface AttentionRow {
  id: string;
  code: string;
  title: string;
  visits: number;
  sale_price: string | null;
  city: string;
  interests: number;
  portals: number;
}

export interface CoverageRow {
  portalId: number;
  portal: string;
  paid: boolean;
  total: number;
  published: number;
}
