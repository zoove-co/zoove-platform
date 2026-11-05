import { Logger } from '@nestjs/common';

import type { AnalyticsEvent, DeliveryOutcome, EventDestination } from './analytics-event';

export type CleverTapSettings = { apiBase: string; accountId: string; passcode: string };

const MAX_PER_REQUEST = 1000; // CleverTap's limit for one upload call.

type Unprocessed = { status?: string; code?: number; error?: string; record?: { identity?: string; ts?: number; evtName?: string } };
type UploadResponse = { status?: string; processed?: number; unprocessed?: Unprocessed[] };

// Sends events to CleverTap's Upload Events API (https://developer.clevertap.com/docs/upload-events-api).
// The identity is our user id, so no phone or email leaves Zoove through this path.
export class CleverTapDestination implements EventDestination {
  readonly name = 'clevertap';
  private readonly logger = new Logger('CleverTap');

  constructor(private readonly settings: CleverTapSettings, private readonly http: typeof fetch = fetch) {}

  async sendBatch(events: AnalyticsEvent[]): Promise<DeliveryOutcome[]> {
    const outcomes: DeliveryOutcome[] = [];
    for (let i = 0; i < events.length; i += MAX_PER_REQUEST) outcomes.push(...(await this.upload(events.slice(i, i + MAX_PER_REQUEST))));
    return outcomes;
  }

  private async upload(events: AnalyticsEvent[]): Promise<DeliveryOutcome[]> {
    const all = (outcome: DeliveryOutcome) => events.map(() => outcome);
    let response: Response;
    try {
      response = await this.http(`${this.settings.apiBase.replace(/\/+$/, '')}/1/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-CleverTap-Account-Id': this.settings.accountId, 'X-CleverTap-Passcode': this.settings.passcode },
        body: JSON.stringify({ d: events.map((e) => ({ identity: e.userId, ts: Math.floor(e.occurredAt.getTime() / 1000), type: 'event', evtName: e.name, evtData: e.properties })) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      return all({ ok: false, error: `network: ${error instanceof Error ? error.message : String(error)}`, retryable: true });
    }
    // Rate limits and server faults are worth retrying. Wrong keys or a bad request are not fixed by retrying.
    if (response.status === 429 || response.status >= 500) return all({ ok: false, error: `http ${response.status}`, retryable: true });
    if (!response.ok) return all({ ok: false, error: `http ${response.status}`, retryable: response.status === 401 || response.status === 403 });

    const body = (await response.json().catch(() => ({}))) as UploadResponse;
    if (body.status === 'success') return all({ ok: true });
    if (body.status === 'partial') {
      // The rejected records are bad data (for example a reserved event name). Retrying the same record will not help.
      const bad = new Set((body.unprocessed ?? []).map((u) => `${u.record?.identity}|${u.record?.ts}|${u.record?.evtName}`));
      return events.map((e) => (bad.has(`${e.userId}|${Math.floor(e.occurredAt.getTime() / 1000)}|${e.name}`) ? { ok: false as const, error: 'rejected by CleverTap', retryable: false } : { ok: true as const }));
    }
    this.logger.warn(`Upload failed: ${JSON.stringify(body).slice(0, 300)}`);
    return all({ ok: false, error: `clevertap ${body.status ?? 'unknown'}`, retryable: true });
  }
}
