import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { EmailProvider } from '../../email/email.provider';
import type { ChannelResult, CustomerMessage, MessageChannel } from '../message-channel';
import { layout } from '../trainer-emails';

@Injectable()
export class EmailChannel implements MessageChannel {
  readonly name = 'email';

  constructor(private readonly db: DatabaseService, private readonly email: EmailProvider) {}

  async deliver(message: CustomerMessage): Promise<ChannelResult> {
    const who = await this.db.query<{ email: string | null }>(`select coalesce(verified_email, email) as email from users where id = $1 and status = 'active'`, [message.userId]);
    const to = who.rows[0]?.email;
    if (!to) return 'skipped'; // phone-only customer or deleted account
    const { html, text } = layout(message.title, [message.body], undefined, 'You received this because of activity on your Zoove account. Reply to this email or write to admin@zoove.co if you need help.');
    await this.email.send({ to, subject: message.title, html, text });
    return 'sent';
  }
}
