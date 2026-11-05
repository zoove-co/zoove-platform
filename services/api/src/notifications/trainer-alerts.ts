import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

export type TrainerAlertKind = 'trainer.job_cancelled' | 'trainer.job_moved' | 'trainer.job_assigned';

export type TrainerAlertContext = {
  sessionCode: string; serviceName: string; when: string; area: string;
  /** For a cancelled job: 'customer' (the customer cancelled) or 'moved' (the customer moved it to a time the trainer is busy). */
  reason?: string;
};

// Queues an email to a trainer about a session they hold. Call it inside the transaction of the change it describes, so the
// alert exists if and only if the change does. The outbox worker sends it and retries on failure.
export async function queueTrainerAlert(client: PoolClient, kind: TrainerAlertKind, bookingId: string, trainerId: string, ctx: TrainerAlertContext): Promise<void> {
  await client.query(
    `insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, $3, $4)`,
    [uuidv7(), bookingId, kind, JSON.stringify({ trainerId, bookingId, ...ctx })],
  );
}
