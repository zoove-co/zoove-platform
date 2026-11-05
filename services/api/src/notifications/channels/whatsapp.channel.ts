import { Injectable } from '@nestjs/common';

import type { ChannelResult, CustomerMessage, MessageChannel } from '../message-channel';

// WhatsApp is the third channel. It is intentionally switched off: sending business-initiated WhatsApp messages needs a
// verified Meta Business account, approved message templates, and the customer's phone number with their opt-in, and none
// of those exist yet. When they do, implement `deliver` here (Meta WhatsApp Cloud API, one approved template per message
// kind) and nothing else in the system changes: the worker already calls every channel for every customer message.
@Injectable()
export class WhatsAppChannel implements MessageChannel {
  readonly name = 'whatsapp';

  deliver(_message: CustomerMessage): Promise<ChannelResult> {
    return Promise.resolve('skipped');
  }
}
