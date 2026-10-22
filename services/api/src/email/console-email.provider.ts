import { Injectable, Logger } from '@nestjs/common';

import { EmailProvider, type EmailMessage } from './email.provider';

// Development only: prints the email instead of sending it.
@Injectable()
export class ConsoleEmailProvider extends EmailProvider {
  private readonly logger = new Logger('Email');

  send(message: EmailMessage): Promise<void> {
    this.logger.warn(`[console email] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return Promise.resolve();
  }
}
