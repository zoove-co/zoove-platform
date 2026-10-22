import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { ConsoleEmailProvider } from './console-email.provider';
import { EmailProvider } from './email.provider';
import { ResendEmailProvider } from './resend-email.provider';

@Global()
@Module({
  providers: [
    ConsoleEmailProvider,
    ResendEmailProvider,
    {
      provide: EmailProvider,
      inject: [APP_CONFIG, ConsoleEmailProvider, ResendEmailProvider],
      useFactory: (config: Env, consoleProvider: ConsoleEmailProvider, resend: ResendEmailProvider) =>
        config.EMAIL_PROVIDER === 'resend' ? resend : consoleProvider,
    },
  ],
  exports: [EmailProvider],
})
export class EmailModule {}
