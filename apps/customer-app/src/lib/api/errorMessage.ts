import type { TFunction } from 'i18next';

import { ApiError } from '@/lib/api/types';

// Maps an API failure to one clear sentence for the customer.
export function authErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_PHONE':
        return t('auth.phoneError');
      case 'OTP_INVALID':
        return t('auth.otpInvalid');
      case 'OTP_LOCKED':
        return t('auth.otpLocked');
      case 'OTP_RATE_LIMITED':
      case 'TOO_MANY_REQUESTS':
        return t('auth.otpRateLimited');
      case 'INVALID_REQUEST':
        return t('auth.emailError');
      case 'EMAIL_FAILED':
      case 'SMS_FAILED':
        return t('auth.sendFailed');
      case 'ACCOUNT_BLOCKED':
        return t('auth.blocked');
      case 'CONSENT_REQUIRED':
        return t('auth.consentRequired');
      case 'NETWORK':
        return t('errors.network');
      default:
        break;
    }
  }
  return t('auth.otpGeneric');
}

export function bookingErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'SLOT_UNAVAILABLE':
      case 'SLOT_CONFLICT':
        return t('booking.errorSlotTaken');
      case 'NOT_SERVICEABLE':
        return t('booking.errorNotServiceable');
      case 'ADDRESS_NOT_FOUND':
        return t('booking.errorAddress');
      case 'ADDRESS_IN_USE':
        return t('addresses.inUse');
      case 'CHANGE_WINDOW_CLOSED':
        return t('session.changeError');
      case 'NETWORK':
        return t('errors.network');
      case 'DISCOUNT_INVALID':
      case 'DISCOUNT_EXPIRED':
      case 'DISCOUNT_USED':
      case 'DISCOUNT_NOT_APPLICABLE':
        return discountErrorMessage(error, t);
      case 'IDEMPOTENCY_KEY_REUSED':
      case 'TOO_MANY_REQUESTS':
        return t('errors.tryAgain');
      default:
        break;
    }
  }
  return t('booking.error');
}

export function deleteAccountErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.code === 'HAS_ACTIVE_BOOKINGS') return t('profile.deleteHasBookings');
    if (error.code === 'FORBIDDEN') return t('profile.deleteForbidden');
    if (error.code === 'NETWORK') return t('errors.network');
  }
  return t('profile.deleteError');
}

export function discountErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'DISCOUNT_INVALID':
        return t('discount.invalid');
      case 'DISCOUNT_EXPIRED':
        return t('discount.expired');
      case 'DISCOUNT_USED':
        return t('discount.used');
      case 'DISCOUNT_NOT_APPLICABLE':
        // The server's own sentence says why (for example the smallest order).
        return error.message && error.message !== error.code ? error.message : t('discount.notApplicable');
      case 'TOO_MANY_REQUESTS':
        return t('discount.tooMany');
      case 'NETWORK':
        return t('errors.network');
      default:
        break;
    }
  }
  return t('discount.error');
}
