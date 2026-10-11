import { mockApi } from './mock';
import type { Api } from './types';

// Switch to the HTTP client here once the NestJS API exists. Screens never import the mock.
export const api: Api = mockApi;

export type { Api, HomeData, ServiceSummary, UpcomingSessionSummary } from './types';
