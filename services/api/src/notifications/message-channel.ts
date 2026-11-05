// A message to a customer that may go out on several channels (email, push, WhatsApp). Each channel decides for itself
// whether it can reach this customer: no email on file, no phone registered, channel not switched on, and so on.
export type CustomerMessage = { userId: string; title: string; body: string; bookingId: string | null };

export type ChannelResult = 'sent' | 'skipped';

export interface MessageChannel {
  /** Short stable name, stored with each delivery so a retry never repeats a channel that already worked. */
  readonly name: string;
  deliver(message: CustomerMessage): Promise<ChannelResult>;
}

export const CUSTOMER_CHANNELS = Symbol('CUSTOMER_CHANNELS');
