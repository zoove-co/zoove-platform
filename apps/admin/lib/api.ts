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

// ---- Trainer applications (mirror the API) ----

export type Status = 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
export type Filter = 'pending' | 'changes_requested' | 'approved' | 'rejected' | 'all';

export type ListItem = { id: string; name: string; phone: string | null; email: string | null; status: Status; specialties: string[]; experienceYears: number | null; source: string | null; submittedAt: string | null };
export type ListResult = { items: ListItem[]; counts: Record<string, number> };

export type DocKind = 'aadhaar_front' | 'aadhaar_back' | 'pan_card' | 'selfie' | 'certificate' | 'other';

export type Detail = {
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
export const startReview = (id: string) => api<unknown>(`/v1/admin/trainer-applications/${id}/start-review`, { method: 'POST', json: {} });
export const approve = (id: string, note?: string) => api<unknown>(`/v1/admin/trainer-applications/${id}/approve`, { method: 'POST', json: note ? { note } : {} });
export const reject = (id: string, reason: string) => api<unknown>(`/v1/admin/trainer-applications/${id}/reject`, { method: 'POST', json: { reason } });
export const requestChanges = (id: string, note: string, documentIds: string[]) => api<unknown>(`/v1/admin/trainer-applications/${id}/request-changes`, { method: 'POST', json: { note, documentIds } });

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'New',
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
