// Stable error codes. The customer app maps each one to a specific message (see ApiErrorCode in the app).
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_PHONE'
  | 'OTP_INVALID'
  | 'OTP_LOCKED'
  | 'OTP_RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'ACCOUNT_BLOCKED'
  | 'EMAIL_TAKEN'
  | 'NOT_FOUND'
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_CONFLICT'
  | 'NOT_SERVICEABLE'
  | 'ADDRESS_NOT_FOUND'
  | 'ADDRESS_IN_USE'
  | 'CHANGE_WINDOW_CLOSED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'TOO_MANY_REQUESTS'
  | 'SMS_FAILED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_PHONE: 400,
  OTP_INVALID: 400,
  OTP_LOCKED: 429,
  OTP_RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  ACCOUNT_BLOCKED: 403,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  SLOT_UNAVAILABLE: 409,
  SLOT_CONFLICT: 409,
  NOT_SERVICEABLE: 422,
  ADDRESS_NOT_FOUND: 404,
  ADDRESS_IN_USE: 409,
  CHANGE_WINDOW_CLOSED: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  TOO_MANY_REQUESTS: 429,
  SMS_FAILED: 502,
  INTERNAL: 500,
};

export class DomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message ?? code, options);
    this.name = 'DomainError';
    this.status = STATUS[code];
  }
}
