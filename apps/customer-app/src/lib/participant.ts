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
