import { API_URL } from '@/lib/config';
import { reportError } from '@/lib/monitoring';

// One client for the Zoove API. It is the same API the Join Zoove web page uses, so an application started on the web
// is the same application here (same account, same saved answers, same documents, same status).

export type ApiErrorCode =
  | 'NETWORK' | 'UNAUTHORIZED' | 'SESSION_EXPIRED' | 'INTERNAL' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'OTP_INVALID' | 'OTP_LOCKED' | 'OTP_RATE_LIMITED' | 'EMAIL_FAILED' | 'ACCOUNT_BLOCKED' | 'EMAIL_TAKEN'
  | 'APPLICATION_INCOMPLETE' | 'INVALID_REQUEST' | 'TOO_MANY_REQUESTS' | (string & {});

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type Session = { accessToken: string; refreshToken: string };
type TokenReply = { token: string; refreshToken: string };

const TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 90_000;
const NETWORK_MESSAGE = 'Could not reach Zoove. Check your internet connection and try again.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

let session: Session | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(next: Session | null) => void>();

function setAndAnnounce(next: Session | null): void {
  session = next;
  for (const listener of listeners) listener(next);
}

export const setSession = (next: Session | null): void => {
  session = next;
};
export const onSessionChange = (listener: (next: Session | null) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

type Sent<T> = { status: number; data: T | null; error: ApiError | null };

async function send<T>(method: string, path: string, body: BodyInit | undefined, headers: Record<string, string>, bearer: string | null, timeoutMs: number): Promise<Sent<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const all: Record<string, string> = { Accept: 'application/json', ...headers };
    if (bearer) all.Authorization = `Bearer ${bearer}`;
    const response = await fetch(`${API_URL}${path}`, { method, headers: all, signal: controller.signal, ...(body !== undefined ? { body } : {}) });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.ok) return { status: response.status, data: json as T, error: null };
    const failure = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const code: ApiErrorCode = failure?.code ?? (response.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL');
    const failed = new ApiError(code, failure?.message ?? GENERIC_MESSAGE, response.status, failure?.details);
    // Only a server fault is worth a report; a refused code or a validation message is normal.
    if (response.status >= 500) reportError(failed, 'api');
    return { status: response.status, data: null, error: failed };
  } catch {
    // No connection, DNS failure, or no answer within the time limit.
    return { status: 0, data: null, error: new ApiError('NETWORK', NETWORK_MESSAGE, 0) };
  } finally {
    clearTimeout(timer);
  }
}

// One refresh at a time: a refresh token works only once, so two parallel refreshes would sign the trainer out.
function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const current = session;
  if (!current) return Promise.resolve(false);
  refreshing = (async () => {
    const result = await send<TokenReply>('POST', '/v1/auth/refresh', JSON.stringify({ refreshToken: current.refreshToken }), { 'Content-Type': 'application/json' }, null, TIMEOUT_MS);
    if (result.data) {
      setAndAnnounce({ accessToken: result.data.token, refreshToken: result.data.refreshToken });
      return true;
    }
    // Only a clear "no" from the server ends the sign-in. A dropped connection keeps it for the next try.
    if (result.error && result.error.code !== 'NETWORK' && (result.status === 400 || result.status === 401)) setAndAnnounce(null);
    return false;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type Options = { method?: string; json?: unknown; form?: FormData; timeoutMs?: number; authed?: boolean };

async function call<T>(path: string, options: Options = {}): Promise<T> {
  const authed = options.authed ?? true;
  const method = options.method ?? (options.json !== undefined || options.form ? 'POST' : 'GET');
  const body = options.json !== undefined ? JSON.stringify(options.json) : options.form;
  const headers: Record<string, string> = options.json !== undefined ? { 'Content-Type': 'application/json' } : {};
  const timeout = options.timeoutMs ?? TIMEOUT_MS;
  const used = authed ? (session?.accessToken ?? null) : null;
  const first = await send<T>(method, path, body, headers, used, timeout);
  if (!first.error) return first.data as T;
  if (authed && first.status === 401 && session) {
    // Someone else may already have refreshed while this request was in flight.
    const renewed = session.accessToken !== used || (await refreshSession());
    if (renewed && session) {
      const second = await send<T>(method, path, body, headers, session.accessToken, timeout);
      if (!second.error) return second.data as T;
      if (second.status !== 401) throw second.error;
    }
    // The refresh was refused (the sign-in is over) or could not be tried (no connection: the sign-in is kept).
    if (session) throw new ApiError('NETWORK', NETWORK_MESSAGE, 0);
    throw new ApiError('SESSION_EXPIRED', 'Your session has ended. Please sign in again. What you filled in is saved.', 401);
  }
  throw first.error;
}

// ---- Sign in (email code, same as the Join Zoove page) ----
export const requestCode = (email: string) => call<{ resendAfterSeconds: number }>('/v1/auth/email-otp/request', { json: { email, audience: 'trainer' }, authed: false });
export async function verifyCode(email: string, code: string): Promise<Session> {
  const reply = await call<TokenReply>('/v1/auth/email-otp/verify', { json: { email, code, audience: 'trainer' }, authed: false });
  return { accessToken: reply.token, refreshToken: reply.refreshToken };
}
// Deletes the trainer's account (details, documents, notes). The server refuses while a session is still ahead and says why.
export const deleteAccount = () => call<null>('/v1/trainer-application/account', { method: 'DELETE' });
export async function logout(): Promise<void> {
  const current = session;
  if (!current) return;
  // The phone is signed out either way; this only tells the server to forget the session.
  await send('POST', '/v1/auth/logout', JSON.stringify({ refreshToken: current.refreshToken }), { 'Content-Type': 'application/json' }, null, 10_000);
}

// ---- The trainer application (mirrors the API; identical to the web page) ----
export type DocumentKind = 'aadhaar_front' | 'aadhaar_back' | 'pan_card' | 'selfie' | 'certificate' | 'other';
export type ApplicationStatus = 'none' | 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
export type TrainerStatus = 'active' | 'paused' | 'suspended' | 'revoked';

export type ApplicationView = {
  id: string | null;
  status: ApplicationStatus;
  trainerStatus: TrainerStatus | null;
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

export const getApplication = () => call<ApplicationView>('/v1/trainer-application');
export const saveApplication = (body: SaveBody) => call<ApplicationView>('/v1/trainer-application', { method: 'PUT', json: body });
export const submitApplication = () => call<ApplicationView>('/v1/trainer-application/submit', { method: 'POST', json: { agree: true } });
export const removeDocument = (id: string) => call<ApplicationView>(`/v1/trainer-application/documents/${id}`, { method: 'DELETE' });

export type PickedFile = { uri: string; name: string; mimeType: string };

export function uploadDocument(kind: DocumentKind, file: PickedFile): Promise<ApplicationView> {
  const form = new FormData();
  form.append('kind', kind); // before the file, so the server reads it first
  // React Native's FormData takes this object shape for a file on the phone.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return call<ApplicationView>('/v1/trainer-application/documents', { form, timeoutMs: UPLOAD_TIMEOUT_MS });
}

export type Service = { slug: string; name: string };
// The services Zoove offers right now (public), so a new service needs no app update.
export async function listServices(): Promise<Service[]> {
  const list = await call<Service[]>('/v1/services', { authed: false });
  return list.map((item) => ({ slug: item.slug, name: item.name }));
}

// ---- Jobs: open sessions nobody has taken (first to accept gets it) and the trainer's own sessions ----
export type OpenJob = { id: string; sessionCode: string; serviceName: string; formatName: string; startsAt: string | null; whenLabel: string; participant: string; groupSize: number | null; area: string | null; nearness: 'same_pincode' | 'near_you' | 'elsewhere' | null };
export type MyJob = OpenJob & { customerFirstName: string; addressLabel: string; addressLine: string; pincode: string | null; canCancel: boolean; canCheckIn: boolean; started: boolean; startedAt: string | null; endsAt: string | null; timeUp: boolean; note: string };
export type DoneJob = OpenJob & { customerFirstName: string; completedAt: string | null; note: string };
export type JobBoard = { acceptingJobs: boolean; open: OpenJob[]; mine: MyJob[]; done: DoneJob[]; doneCount: number };
export const getJobs = () => call<JobBoard>('/v1/trainer/jobs');
export const acceptJob = (id: string) => call<JobBoard>(`/v1/trainer/jobs/${id}/accept`, { method: 'POST', json: {} });
// The customer shows a 4-digit start code on arrival and a finish code after the training.
export const checkInJob = (id: string, code: string) => call<JobBoard>(`/v1/trainer/jobs/${id}/check-in`, { method: 'POST', json: { code } });
export const checkOutJob = (id: string, code: string) => call<JobBoard>(`/v1/trainer/jobs/${id}/check-out`, { method: 'POST', json: { code } });
export const cancelJob = (id: string, reason: string) => call<JobBoard>(`/v1/trainer/jobs/${id}/cancel`, { method: 'POST', json: { reason } });

// ---- Push messages (same endpoints the customer app uses) ----
export const registerDevice = (token: string, platform: 'ios' | 'android') => call<void>('/v1/me/devices', { method: 'POST', json: { token, platform } });
export const removeDevice = (token: string) => call<void>('/v1/me/devices', { method: 'DELETE', json: { token } });

export const errorMessage = (err: unknown): string => (err instanceof ApiError ? err.message : GENERIC_MESSAGE);
export const saveNote = (id: string, note: string) => call<JobBoard>(`/v1/trainer/jobs/${id}/note`, { method: 'PUT', json: { note } });
export const setAcceptingJobs = (acceptingJobs: boolean) => call<JobBoard>('/v1/trainer/jobs/availability', { method: 'PUT', json: { acceptingJobs } });
