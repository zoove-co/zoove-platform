import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { EmailProvider, type EmailMessage } from './email.provider';

// https://resend.com/docs/api-reference/emails/send-email
@Injectable()
export class ResendEmailProvider extends EmailProvider {
  constructor(@Inject(APP_CONFIG) private readonly config: Env) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.RESEND_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.config.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}
