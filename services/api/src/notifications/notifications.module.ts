import { Module } from '@nestjs/common';

import { EmailChannel } from './channels/email.channel';
import { ExpoPushChannel } from './channels/expo-push.channel';
import { WhatsAppChannel } from './channels/whatsapp.channel';
import { CustomerMessageService } from './customer-message.service';
import { CUSTOMER_CHANNELS } from './message-channel';
import { OutboxWorkerService } from './outbox-worker.service';

// Every message to a customer goes out on all of these channels; each one skips customers it cannot reach.
// To add a channel: write a class that implements MessageChannel and add it to the list below.
@Module({
  providers: [
    EmailChannel,
    ExpoPushChannel,
    WhatsAppChannel,
    {
      provide: CUSTOMER_CHANNELS,
      inject: [EmailChannel, ExpoPushChannel, WhatsAppChannel],
      useFactory: (email: EmailChannel, push: ExpoPushChannel, whatsapp: WhatsAppChannel) => [email, push, whatsapp],
    },
    CustomerMessageService,
    OutboxWorkerService,
  ],
  exports: [OutboxWorkerService, CustomerMessageService],
})
export class NotificationsModule {}
