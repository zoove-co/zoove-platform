import type { Env } from '../src/config/env';
import type { DatabaseService } from '../src/database/database.service';
import { ExpoPushChannel } from '../src/notifications/channels/expo-push.channel';

// The push channel with a fake database and a fake Expo endpoint: no network, no Postgres.
function setup() {
  const sent: Array<Record<string, unknown>> = [];
  const db = { query: async () => ({ rows: [{ token: 'ExponentPushToken[abc]' }] }) } as unknown as DatabaseService;
  const http = (async (_url: unknown, init: { body: string }) => {
    sent.push(...(JSON.parse(init.body) as Array<Record<string, unknown>>));
    return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
  }) as unknown as typeof fetch;
  return { sent, channel: new ExpoPushChannel(db, {} as Env, http) };
}

describe('ExpoPushChannel', () => {
  it('sends an ordinary message on the default channel with no expiry', async () => {
    const { sent, channel } = setup();
    expect(await channel.deliver({ userId: 'u', title: 'Hi', body: 'There', bookingId: null })).toBe('sent');
    expect(sent[0]).toMatchObject({ channelId: 'default', priority: 'high' });
    expect(sent[0]).not.toHaveProperty('ttl');
  });

  it('sends an urgent message on the ringing jobs channel and lets it expire', async () => {
    const { sent, channel } = setup();
    await channel.deliver({ userId: 'u', title: 'New job request', body: 'x', bookingId: 'b1', urgent: true });
    expect(sent[0]).toMatchObject({ channelId: 'jobs', priority: 'high', ttl: 600, data: { bookingId: 'b1' } });
  });
});
