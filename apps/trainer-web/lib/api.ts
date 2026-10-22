// Talks to the Zoove API. Tokens live in this browser only; a 401 triggers one silent refresh.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://zoove-api-pug9.onrender.com').replace(/\/$/, '');
const SESSION_KEY = 'zoove.trainer.session';

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
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return parsed.token && parsed.refreshToken ? { token: parsed.token, refreshToken: parsed.refreshToken } : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: the session simply will not survive a reload */
  }
}

export const hasSession = (): boolean => readSession() !== null;

async function send(path: string, init: RequestInit, token: string | null, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach Zoove. Check your internet connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    return new ApiError(body.error?.code ?? 'INTERNAL', body.error?.message ?? 'Something went wrong. Please try again.', response.status, body.error?.details);
  } catch {
    return new ApiError('INTERNAL', 'Something went wrong. Please try again.', response.status);
  }
}

let refreshing: Promise<Session | null> | null = null;

// One refresh at a time: refresh tokens are single use, so two parallel refreshes would sign the user out.
function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    const current = readSession();
    if (!current) return null;
    try {
      const response = await send('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }) }, null, 20_000);
      if (!response.ok) {
        // A rejected refresh token means the sign-in is over. A network or server hiccup keeps it.
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

type Options = { method?: string; json?: unknown; form?: FormData; timeoutMs?: number };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? (options.json || options.form ? 'POST' : 'GET') };
  if (options.json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.json);
  } else if (options.form) {
    init.body = options.form;
  }
  const timeout = options.timeoutMs ?? 30_000;
  let session = readSession();
  let response = await send(path, init, session?.token ?? null, timeout);
  if (response.status === 401 && session) {
    session = await refreshSession();
    if (session) response = await send(path, init, session.token, timeout);
  }
  if (!response.ok) {
    const error = await toError(response);
    if (response.status === 401) throw new ApiError('SESSION_EXPIRED', 'Your session has ended. Please sign in again; what you filled in is saved.', 401);
    throw error;
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function requestCode(email: string): Promise<{ resendAfterSeconds: number }> {
  const response = await send('/v1/auth/email-otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, audience: 'trainer' }) }, null, 30_000);
  if (!response.ok) throw await toError(response);
  return (await response.json()) as { resendAfterSeconds: number };
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const response = await send('/v1/auth/email-otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, audience: 'trainer' }) }, null, 30_000);
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
    /* already signed out on this device */
  }
}

// ---- Trainer application types (mirror the API) ----

export type DocumentKind = 'aadhaar_front' | 'aadhaar_back' | 'pan_card' | 'selfie' | 'certificate' | 'other';

export type ApplicationView = {
  id: string | null;
  status: 'none' | 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
  form: {
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    email: string | null;
    phone: string | null;
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
  documents: { id: string; kind: DocumentKind; status: 'uploaded' | 'accepted' | 'rejected'; note: string | null; mimeType: string; uploadedAt: string }[];
  missing: string[];
  canEdit: boolean;
  canSubmit: boolean;
  reviewNote: string | null;
  submittedAt: string | null;
};

export type SaveBody = Partial<{
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'female' | 'male' | 'other' | 'prefer_not_to_say';
  email: string;
  phone: string;
  addressLine: string;
  addressArea: string;
  addressPincode: string;
  specialties: string[];
  experienceYears: number;
  languages: string[];
  bio: string;
  panNumber: string;
  aadhaarLast4: string;
  source: string;
}>;

export const getApplication = () => api<ApplicationView>('/v1/trainer-application');
export const saveApplication = (body: SaveBody) => api<ApplicationView>('/v1/trainer-application', { method: 'PUT', json: body });
export const submitApplication = () => api<ApplicationView>('/v1/trainer-application/submit', { method: 'POST', json: { agree: true } });
export const removeDocument = (id: string) => api<ApplicationView>(`/v1/trainer-application/documents/${id}`, { method: 'DELETE' });

export function uploadDocument(kind: DocumentKind, file: Blob, filename: string): Promise<ApplicationView> {
  const form = new FormData();
  form.append('kind', kind); // before the file, so the server reads it first
  form.append('file', file, filename);
  return api<ApplicationView>('/v1/trainer-application/documents', { method: 'POST', form, timeoutMs: 90_000 });
}

export type Service = { slug: string; name: string };

// The services Zoove offers right now (public). Trainers pick from these, so a new service needs no code change.
export async function listServices(): Promise<Service[]> {
  const response = await send('/v1/services', {}, null, 15_000);
  if (!response.ok) throw await toError(response);
  const data = (await response.json()) as Service[];
  return data.map((item) => ({ slug: item.slug, name: item.name }));
}
