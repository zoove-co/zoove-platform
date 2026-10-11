import { rupeesToPaise } from '@zoove/shared';

import type { Api, HomeData } from './types';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Placeholder data mirroring Pratik's prototype v1 (services: Yoga, Strength, Pilates, Zumba).
// Prices and rules are NOT final: see docs/open-questions.md.
const home: HomeData = {
  customerFirstName: 'Pratik',
  locationLabel: 'Bandra West, Mumbai',
  hasUnreadNotifications: true,
  instant: { etaHours: 4, pricePaise: rupeesToPaise(1500) },
  scheduled: { pricePaise: rupeesToPaise(1500) },
  demo: { pricePaise: rupeesToPaise(500), originalPricePaise: rupeesToPaise(1500) },
  services: [
    { slug: 'yoga', name: 'Yoga' },
    { slug: 'strength', name: 'Strength' },
    { slug: 'pilates', name: 'Pilates' },
    { slug: 'zumba', name: 'Zumba' },
  ],
  upcomingSession: {
    id: 'mock-session-1',
    serviceName: 'Yoga',
    whenLabel: 'Tue, 14 Oct · 7:00 AM',
    sessionsDoneThisWeek: 2,
    weeklyGoal: 3,
  },
};

export const mockApi: Api = {
  async getHome() {
    await wait(350);
    return home;
  },
};
