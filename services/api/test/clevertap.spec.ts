import type { AnalyticsEvent } from '../src/analytics/analytics-event';
import { CleverTapDestination } from '../src/analytics/clevertap.destination';
import { parseEnv } from '../src/config/env';

const event = (name: string, id = 'e1'): AnalyticsEvent => ({ id, name, userId: 'user-1', occurredAt: new Date('2026-11-05T10:00:00Z'), properties: { amount_paise: 50000, area: null } });
const settings = { apiBase: 'https://in1.api.clevertap.com/', accountId: 'ACC', passcode: 'PASS' };
const reply = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;

describe('CleverTap destination', () => {
  it('posts events in the Upload Events format with our user id as identity', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const http = ((url: string, init: RequestInit) => {
      seen = { url, init };
      return Promise.resolve(new Response(JSON.stringify({ status: 'success', processed: 1, unprocessed: [] })));
    }) as unknown as typeof fetch;
    const out = await new CleverTapDestination(settings, http).sendBatch([event('booking_confirmed')]);
    expect(out).toEqual([{ ok: true }]);
    expect(seen?.url).toBe('https://in1.api.clevertap.com/1/upload');
    expect((seen?.init.headers as Record<string, string>)['X-CleverTap-Account-Id']).toBe('ACC');
    expect(JSON.parse(seen?.init.body as string)).toEqual({ d: [{ identity: 'user-1', ts: 1793872800, type: 'event', evtName: 'booking_confirmed', evtData: { amount_paise: 50000, area: null } }] });
  });

  it('marks only rejected records as failed for good when the upload is partial', async () => {
    const http = reply(200, { status: 'partial', processed: 1, unprocessed: [{ status: 'fail', code: 512, record: { identity: 'user-1', ts: 1793872800, evtName: 'bad_one' } }] });
    const out = await new CleverTapDestination(settings, http).sendBatch([event('good_one'), event('bad_one')]);
    expect(out[0]).toEqual({ ok: true });
    expect(out[1]).toMatchObject({ ok: false, retryable: false });
  });

  it('retries on server errors and rate limits, not on bad keys', async () => {
    expect((await new CleverTapDestination(settings, reply(503, {})).sendBatch([event('a')]))[0]).toMatchObject({ ok: false, retryable: true });
    expect((await new CleverTapDestination(settings, reply(429, {})).sendBatch([event('a')]))[0]).toMatchObject({ ok: false, retryable: true });
    expect((await new CleverTapDestination(settings, reply(400, {})).sendBatch([event('a')]))[0]).toMatchObject({ ok: false, retryable: false });
  });

  it('retries when the network fails', async () => {
    const down = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect((await new CleverTapDestination(settings, down).sendBatch([event('a')]))[0]).toMatchObject({ ok: false, retryable: true });
  });
});

describe('CleverTap settings', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32), OTP_SECRET: 'b'.repeat(32) };
  it('is off when empty, needs all three values together, and must be https', () => {
    expect(parseEnv({ ...base }).CLEVERTAP_API_BASE).toBeUndefined();
    expect(() => parseEnv({ ...base, CLEVERTAP_ACCOUNT_ID: 'a' })).toThrow();
    expect(() => parseEnv({ ...base, CLEVERTAP_ACCOUNT_ID: 'a', CLEVERTAP_PASSCODE: 'p', CLEVERTAP_API_BASE: 'http://x' })).toThrow();
    expect(parseEnv({ ...base, CLEVERTAP_ACCOUNT_ID: 'a', CLEVERTAP_PASSCODE: 'p', CLEVERTAP_API_BASE: 'https://in1.api.clevertap.com' }).CLEVERTAP_ACCOUNT_ID).toBe('a');
  });
});
