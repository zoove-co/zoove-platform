import type { TFunction } from 'i18next';

import type { Participant } from '@/lib/api';

const KEYS: Record<Participant, string> = {
  personal: 'booking.personal',
  duo: 'booking.duo',
  loved_one: 'booking.lovedOne',
  group: 'booking.group',
};

// "Personal", "Duo", "Loved One" or "Group": who the session is for.
export const participantLabel = (participant: Participant, t: TFunction): string => t(KEYS[participant]);

export const GROUP_MIN = 3;
export const GROUP_MAX = 30;

// Accepts "98765 43210", "+91 98765 43210" or "09876543210"; returns +91XXXXXXXXXX, or null when it is not a valid Indian mobile.
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

export const isValidRecipientName = (name: string): boolean => name.trim().length >= 2 && name.trim().length <= 80;
