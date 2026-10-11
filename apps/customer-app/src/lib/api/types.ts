import type { Paise } from '@zoove/shared';

// The contract between the app and the backend. The mock below implements it today;
// an HTTP client generated from the NestJS OpenAPI spec will replace it (decision D11).

export interface ServiceSummary {
  slug: string;
  name: string;
}

export interface UpcomingSessionSummary {
  id: string;
  serviceName: string;
  whenLabel: string;
  sessionsDoneThisWeek: number;
  weeklyGoal: number;
}

export interface HomeData {
  customerFirstName: string;
  locationLabel: string;
  hasUnreadNotifications: boolean;
  instant: { etaHours: number; pricePaise: Paise };
  scheduled: { pricePaise: Paise };
  demo: { pricePaise: Paise; originalPricePaise: Paise };
  services: ServiceSummary[];
  upcomingSession: UpcomingSessionSummary | null;
}

export interface Api {
  getHome(): Promise<HomeData>;
}
