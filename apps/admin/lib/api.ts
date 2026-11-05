// Talks to the Zoove API as an admin. The session lives in this tab only (cleared when the tab closes).

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://zoove-api-pug9.onrender.com').replace(/\/$/, '');
const SESSION_KEY = 'zoove.admin.session';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Session = { token: string; refreshToken: string };

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return parsed.token && parsed.refreshToken ? { token: parsed.token, refreshToken: parsed.refreshToken } : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: the session will not survive a reload */
  }
}

export const hasSession = (): boolean => readSession() !== null;

async function send(path: string, init: RequestInit, token: string | null, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the Zoove API. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    return new ApiError(body.error?.code ?? 'INTERNAL', body.error?.message ?? 'Something went wrong.', response.status, body.error?.details);
  } catch {
    return new ApiError('INTERNAL', 'Something went wrong.', response.status);
  }
}

let refreshing: Promise<Session | null> | null = null;

function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    const current = readSession();
    if (!current) return null;
    try {
      const response = await send('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }) }, null, 20_000);
      if (!response.ok) {
        if (response.status === 401 || response.status === 400) writeSession(null);
        return null;
      }
      const data = (await response.json()) as Session;
      writeSession({ token: data.token, refreshToken: data.refreshToken });
      return readSession();
    } catch {
      return null;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, options: { method?: string; json?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? (options.json !== undefined ? 'POST' : 'GET') };
  if (options.json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.json);
  }
  let session = readSession();
  let response = await send(path, init, session?.token ?? null);
  if (response.status === 401 && session) {
    session = await refreshSession();
    if (session) response = await send(path, init, session.token);
  }
  if (!response.ok) {
    if (response.status === 401) throw new ApiError('SESSION_EXPIRED', 'Your session has ended. Please sign in again.', 401);
    throw await toError(response);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function requestCode(email: string): Promise<{ resendAfterSeconds: number }> {
  const response = await send('/v1/auth/email-otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, audience: 'admin' }) }, null);
  if (!response.ok) throw await toError(response);
  return (await response.json()) as { resendAfterSeconds: number };
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const response = await send('/v1/auth/email-otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, audience: 'admin' }) }, null);
  if (!response.ok) throw await toError(response);
  const data = (await response.json()) as Session;
  writeSession({ token: data.token, refreshToken: data.refreshToken });
}

export async function signOut(): Promise<void> {
  const session = readSession();
  writeSession(null);
  if (!session) return;
  try {
    await send('/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) }, null, 10_000);
  } catch {
    /* already signed out here */
  }
}

// ---- Team (mirror the API) ----

export type PermissionInfo = { key: string; group: string; label: string; hint: string; soon: boolean };
export type Member = {
  id: string;
  name: string;
  email: string | null;
  jobTitle: string;
  isOwner: boolean;
  reportsTo: { id: string; name: string } | null;
  permissions: string[];
  active: boolean;
  lastLoginAt: string | null;
  invitedAt: string;
  invitedBy: string | null;
};
export type Me = Member & { catalog: PermissionInfo[] };
export type MemberInput = { name: string; jobTitle: string; reportsTo: string | null; permissions: string[]; isOwner: boolean };

export const getMe = () => api<Me>('/v1/admin/me');
export const listTeam = () => api<{ members: Member[]; permissions: PermissionInfo[] }>('/v1/admin/team');
export const addMember = (input: MemberInput & { email: string }) => api<Member>('/v1/admin/team', { method: 'POST', json: input });
export const updateMember = (id: string, patch: Partial<MemberInput> & { active?: boolean }) => api<Member>(`/v1/admin/team/${id}`, { method: 'PATCH', json: patch });

// ---- Discount codes (mirror the API) ----

export type DiscountReason = 'goodwill' | 'emergency' | 'misconduct' | 'referral' | 'promo' | 'other';
export type DiscountCode = {
  id: string;
  code: string;
  kind: 'percent' | 'flat';
  percentOff: number | null;
  flatOffPaise: number | null;
  maxDiscountPaise: number | null;
  reason: DiscountReason;
  note: string | null;
  customerEmail: string | null;
  maxRedemptions: number;
  perUserLimit: number;
  used: number;
  minOrderPaise: number;
  appliesTo: 'any' | 'session' | 'package';
  expiresAt: string | null;
  status: 'active' | 'expired' | 'used_up' | 'disabled';
  createdBy: string | null;
  createdAt: string;
};
export type NewDiscountCode = {
  code?: string;
  kind: 'percent' | 'flat';
  percentOff?: number;
  flatOffPaise?: number;
  maxDiscountPaise?: number;
  reason: DiscountReason;
  note?: string;
  customerEmail?: string;
  maxRedemptions: number;
  perUserLimit: number;
  minOrderPaise: number;
  appliesTo: 'any' | 'session' | 'package';
  expiresAt?: string;
};
export const listDiscountCodes = () => api<DiscountCode[]>('/v1/admin/discount-codes');
export const createDiscountCode = (input: NewDiscountCode) => api<DiscountCode>('/v1/admin/discount-codes', { method: 'POST', json: input });
export const disableDiscountCode = (id: string) => api<DiscountCode>(`/v1/admin/discount-codes/${id}/disable`, { method: 'POST', json: {} });

// ---- Trainer applications (mirror the API) ----

export type Status = 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
export type Filter = 'pending' | 'changes_requested' | 'approved' | 'rejected' | 'all';

export type TrainerStatus = 'active' | 'paused' | 'suspended' | 'revoked';
export type ListItem = { trainerStatus: TrainerStatus | null; id: string; name: string; phone: string | null; email: string | null; status: Status; specialties: string[]; experienceYears: number | null; source: string | null; submittedAt: string | null };
export type ListResult = { items: ListItem[]; counts: Record<string, number> };

export type DocKind = 'aadhaar_front' | 'aadhaar_back' | 'pan_card' | 'selfie' | 'certificate' | 'other';

export type Detail = {
  trainerStatus: TrainerStatus | null;
  id: string;
  status: Status | 'draft';
  phone: string | null;
  source: string | null;
  form: {
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    email: string | null;
    addressLine: string | null;
    addressArea: string | null;
    addressCity: string;
    addressPincode: string | null;
    specialties: string[];
    experienceYears: number | null;
    languages: string[];
    bio: string | null;
    panLast4: string | null;
    aadhaarLast4: string | null;
  };
  documents: { id: string; kind: DocKind; status: 'uploaded' | 'accepted' | 'rejected'; note: string | null; mimeType: string; uploadedAt: string }[];
  reviewNote: string | null;
  submittedAt: string | null;
  events: { type: string; actor: string; payload: Record<string, unknown>; at: string }[];
};

export const listApplications = (filter: Filter, search: string) => {
  const params = new URLSearchParams({ limit: '200' });
  if (filter !== 'all') params.set('status', filter);
  if (search.trim()) params.set('search', search.trim());
  return api<ListResult>(`/v1/admin/trainer-applications?${params.toString()}`);
};
export const getApplication = (id: string) => api<Detail>(`/v1/admin/trainer-applications/${id}`);
export const documentLink = (id: string, documentId: string) => api<{ url: string; expiresInSeconds: number }>(`/v1/admin/trainer-applications/${id}/documents/${documentId}/url`);
export const setTrainerStatus = (id: string, status: TrainerStatus, reason?: string) =>
  api<unknown>(`/v1/admin/trainer-applications/${id}/trainer-status`, { method: 'POST', json: reason ? { status, reason } : { status } });
export const startReview = (id: string) => api<unknown>(`/v1/admin/trainer-applications/${id}/start-review`, { method: 'POST', json: {} });
export const approve = (id: string, note?: string) => api<unknown>(`/v1/admin/trainer-applications/${id}/approve`, { method: 'POST', json: note ? { note } : {} });
export const reject = (id: string, reason: string) => api<unknown>(`/v1/admin/trainer-applications/${id}/reject`, { method: 'POST', json: { reason } });
export const requestChanges = (id: string, note: string, documentIds: string[]) => api<unknown>(`/v1/admin/trainer-applications/${id}/request-changes`, { method: 'POST', json: { note, documentIds } });

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'New',
  active: 'Active',
  paused: 'Paused',
  suspended: 'Suspended',
  revoked: 'Revoked',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  draft: 'Draft',
};
export const KIND_LABEL: Record<string, string> = {
  aadhaar_front: 'Aadhaar front',
  aadhaar_back: 'Aadhaar back',
  pan_card: 'PAN card',
  selfie: 'Selfie',
  certificate: 'Certificate',
  other: 'Other',
};

// Specialties are stored as slugs (yoga, pilates). Show them as words.
export const nice = (slug: string): string => slug.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ---- Party requests and packages (mirror the API) ----

export type PartyStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled';
export type PartyRequest = {
  id: string; occasion: string; serviceSlug: string; guests: number; startsAt: string; status: PartyStatus; createdAt: string;
  customer: string; contactPhone: string | null; note: string | null; adminNote: string | null; address: string; handledBy: string | null; handledAt: string | null;
};
export const listPartyRequests = () => api<PartyRequest[]>('/v1/admin/party-requests');
export const setPartyStatus = (id: string, status: PartyStatus, adminNote?: string) =>
  api<PartyRequest>(`/v1/admin/party-requests/${id}/status`, { method: 'POST', json: adminNote ? { status, adminNote } : { status } });

export type PackageOrder = {
  id: string; name: string; sessionsCount: number; listPricePaise: number; discountPaise: number; discountCode: string | null; totalPaise: number;
  status: 'awaiting_payment' | 'paid' | 'cancelled'; creditsLeft: number; creditsTotal: number; expiresAt: string | null; paidAt: string | null; createdAt: string;
  expired: boolean; creditsUnused: number;
  customer: string; paymentMethod: string | null; paymentReference: string | null;
};
export type AdminPackage = { id: string; name: string; sessionsCount: number; pricePaise: number; originalPricePaise: number | null; validityDays: number | null; badge: string | null; isActive: boolean };
export type PackageInput = { name: string; sessionsCount: number; pricePaise: number; originalPricePaise: number | null; validityDays: number | null; badge: string | null; isActive: boolean };
export const listPackageOrders = () => api<PackageOrder[]>('/v1/admin/package-orders');
export const markOrderPaid = (id: string, method: string, reference: string) => api<PackageOrder>(`/v1/admin/package-orders/${id}/mark-paid`, { method: 'POST', json: { method, reference } });
export const cancelOrder = (id: string) => api<PackageOrder>(`/v1/admin/package-orders/${id}/cancel`, { method: 'POST', json: {} });
export type PackageException = { id: string; reason: string; extraSessions: number; extendDays: number; expiresAt: string | null; by: string; at: string };
export const grantPackageException = (id: string, input: { extraSessions: number; extendDays: number; reason: string }) =>
  api<PackageOrder>(`/v1/admin/package-orders/${id}/exception`, { method: 'POST', json: input });
export const packageExceptions = (id: string) => api<PackageException[]>(`/v1/admin/package-orders/${id}/history`);
export const listAdminPackages = () => api<AdminPackage[]>('/v1/admin/packages');
export const savePackage = (id: string | null, input: PackageInput) => api<AdminPackage>(id ? `/v1/admin/packages/${id}` : '/v1/admin/packages', { method: 'POST', json: input });

// ---- Offerings (services, styles, prices), rewards and sessions (mirror the API) ----

export type BookingModeKey = 'instant' | 'scheduled' | 'demo';
export type PriceCell = { pricePaise: number } | null;
export type AdminFormat = { id: string; slug: string; name: string; description: string | null; sortOrder: number; isActive: boolean };
export type AdminService = {
  id: string; slug: string; name: string; tagline: string | null; durationMinMinutes: number; durationMaxMinutes: number; intensity: string | null;
  sortOrder: number; isActive: boolean; formats: AdminFormat[]; ownPrices: Record<BookingModeKey, PriceCell>;
};
export type ParticipantRule = { participant: 'duo' | 'loved_one' | 'group'; percent: number; perHead: boolean; isPlaceholder: boolean };
export type Offerings = { services: AdminService[]; defaultPrices: Record<BookingModeKey, PriceCell>; participants: ParticipantRule[] };
export type ServiceInput = { name: string; tagline: string | null; durationMinMinutes: number; durationMaxMinutes: number; intensity: string | null; sortOrder: number; isActive: boolean };
export type FormatInput = { name: string; description: string | null; sortOrder: number; isActive: boolean };
export const getOfferings = () => api<Offerings>('/v1/admin/offerings');
export const createService = (slug: string, input: ServiceInput) => api<{ id: string }>('/v1/admin/offerings/services', { method: 'POST', json: { slug, ...input } });
export const updateService = (id: string, input: ServiceInput) => api<{ id: string }>(`/v1/admin/offerings/services/${id}`, { method: 'POST', json: input });
export const createFormat = (serviceId: string, slug: string, input: FormatInput) => api<{ id: string }>(`/v1/admin/offerings/services/${serviceId}/formats`, { method: 'POST', json: { slug, ...input } });
export const updateFormat = (serviceId: string, formatId: string, input: FormatInput) => api<{ id: string }>(`/v1/admin/offerings/services/${serviceId}/formats/${formatId}`, { method: 'POST', json: input });
export const setPrice = (serviceId: string | null, mode: BookingModeKey, pricePaise: number | null) => api<Offerings>('/v1/admin/offerings/prices', { method: 'PUT', json: { serviceId, mode, pricePaise } });
export const setParticipantRule = (participant: string, percent: number, perHead: boolean) => api<Offerings>(`/v1/admin/offerings/participants/${participant}`, { method: 'PUT', json: { percent, perHead } });

export type RewardSide = 'referrer' | 'friend';
export type RewardRule = { side: RewardSide; enabled: boolean; kind: 'flat' | 'percent' | null; flatOffPaise: number | null; percentOff: number | null; maxDiscountPaise: number | null; validDays: number };
export type IssuedReward = { id: string; side: RewardSide; customer: string; code: string; state: 'unused' | 'used' | 'expired' | 'switched_off'; createdAt: string; expiresAt: string | null };
export type RewardsOverview = { rules: RewardRule[]; issued: IssuedReward[]; stats: { signedUp: number; booked: number; rewardsGiven: number } };
export const getRewards = () => api<RewardsOverview>('/v1/admin/rewards');
export const saveReward = (side: RewardSide, rule: Omit<RewardRule, 'side'>) => api<RewardsOverview>(`/v1/admin/rewards/${side}`, { method: 'PUT', json: rule });
export const switchOffReward = (id: string) => api<RewardsOverview>(`/v1/admin/rewards/issued/${id}/switch-off`, { method: 'POST', json: {} });

export type SessionStatus = 'matching' | 'confirmed' | 'rematching' | 'completed' | 'cancelled';
export type AdminSession = {
  id: string; sessionCode: string; status: SessionStatus; mode: string; participant: string; groupSize: number | null; serviceName: string; formatName: string;
  startsAt: string | null; whenLabel: string; startPassed: boolean; area: string | null; customerName: string; customerContact: string;
  trainerId: string | null; trainerName: string | null; trainerCancelCount: number; trainerCancelledAt: string | null; canMarkNoShow: boolean; totalPaise: number; paidWithCredit: boolean; discountCode: string | null; createdAt: string;
};
export type SessionDetail = AdminSession & {
  addressLabel: string; addressLine: string; pincode: string | null; recipient: { name: string; phone: string } | null;
  events: { type: string; actor: string; payload: Record<string, unknown>; createdAt: string }[];
};
export type SessionFilter = 'needs_trainer' | 'upcoming' | 'all';
export const sessionSummary = () => api<{ needsTrainer: number; trainerCancelled: number; overdue: number }>('/v1/admin/sessions/summary');
export const listSessions = (filter: SessionFilter, q: string) => api<AdminSession[]>(`/v1/admin/sessions?filter=${filter}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
export const getSession = (id: string) => api<SessionDetail>(`/v1/admin/sessions/${id}`);
export const listAssignableTrainers = () => api<{ id: string; name: string }[]>('/v1/admin/sessions/trainers');
export const recordTrainerCancel = (id: string, reason: string) => api<SessionDetail>(`/v1/admin/sessions/${id}/trainer-cancel`, { method: 'POST', json: { reason } });
export const assignTrainer = (id: string, trainerId: string) => api<SessionDetail>(`/v1/admin/sessions/${id}/assign`, { method: 'POST', json: { trainerId } });
export const recordTrainerNoShow = (id: string, note: string) => api<SessionDetail>(`/v1/admin/sessions/${id}/no-show`, { method: 'POST', json: { note } });
