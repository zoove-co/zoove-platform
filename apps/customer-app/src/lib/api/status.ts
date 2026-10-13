import type { BookingStatus } from './types';

// A session the customer still expects to happen.
export const isActiveStatus = (status: BookingStatus): boolean =>
  status === 'confirmed' || status === 'matching' || status === 'rematching';
