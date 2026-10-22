import { Injectable, Logger } from '@nestjs/common';

import { SmsProvider } from './sms.provider';

// Development provider: writes the message to the log instead of sending it. Never used in production.
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('Sms');

  send(phoneE164: string, message: string): Promise<void> {
    this.logger.log(`To ${phoneE164}: ${message}`);
    return Promise.resolve();
  }
}
