import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

// One line in the customer's notification list, and (unless `external` is false) a `customer.notify` event so the same
// message also reaches them by email, push and, later, WhatsApp. Call it inside the transaction of the change it describes,
// so the message exists if and only if the change does. Pass `external: false` when another event already sends its own email.
export async function notifyCustomer(
  client: PoolClient, userId: string, title: string, body: string, bookingId: string | null, options: { external?: boolean } = {},
): Promise<void> {
  await client.query(`insert into customer_notifications (id, user_id, title, body, booking_id) values ($1, $2, $3, $4, $5)`, [
    uuidv7(), userId, title, body, bookingId,
  ]);
  if (options.external === false) return;
  await client.query(
    `insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'user', $2, 'customer.notify', $3)`,
    [uuidv7(), userId, JSON.stringify({ userId, title, body, bookingId })],
  );
}
