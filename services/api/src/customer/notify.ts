import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

// One line in the customer's notification list. Call it inside the transaction of the change it describes,
// so the message exists if and only if the change does.
export async function notifyCustomer(client: PoolClient, userId: string, title: string, body: string, bookingId: string | null): Promise<void> {
  await client.query(`insert into customer_notifications (id, user_id, title, body, booking_id) values ($1, $2, $3, $4, $5)`, [
    uuidv7(), userId, title, body, bookingId,
  ]);
}
