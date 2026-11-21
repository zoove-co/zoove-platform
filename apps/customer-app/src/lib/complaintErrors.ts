import type { TFunction } from 'i18next';

import { ApiError } from '@/lib/api/types';

// One clear sentence for a complaint that could not be sent.
export function complaintErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.code === 'TOO_MANY_REQUESTS') return t('complaints.tooMany');
    if (error.code === 'INVALID_STATE') return t('complaints.closedError');
    if (error.code === 'NETWORK') return t('errors.network');
  }
  return t('complaints.sendError');
}
