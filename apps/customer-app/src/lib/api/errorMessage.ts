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
        return t('auth.otpRateLimited');
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
      default:
        break;
    }
  }
  return t('booking.error');
}
