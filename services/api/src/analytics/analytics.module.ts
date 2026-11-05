import { Module } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { EVENT_DESTINATIONS, type EventDestination } from './analytics-event';
import { CleverTapDestination } from './clevertap.destination';
import { EventDispatcherService } from './event-dispatcher.service';

// Chooses the destinations from configuration. Nothing configured means no events leave Zoove.
// To add another tool (Firebase, a warehouse): write one EventDestination class and add it to this list.
@Module({
  providers: [
    {
      provide: EVENT_DESTINATIONS,
      inject: [APP_CONFIG],
      useFactory: (config: Env): EventDestination[] => {
        const list: EventDestination[] = [];
        if (config.CLEVERTAP_ACCOUNT_ID && config.CLEVERTAP_PASSCODE && config.CLEVERTAP_API_BASE) {
          list.push(new CleverTapDestination({ apiBase: config.CLEVERTAP_API_BASE, accountId: config.CLEVERTAP_ACCOUNT_ID, passcode: config.CLEVERTAP_PASSCODE }));
        }
        return list;
      },
    },
    EventDispatcherService,
  ],
  exports: [EventDispatcherService, EVENT_DESTINATIONS],
})
export class AnalyticsModule {}
