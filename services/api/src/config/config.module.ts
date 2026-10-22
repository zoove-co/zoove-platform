import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, parseEnv } from './env';

// Local development reads services/api/.env (Node 22+). Real environment variables always win,
// and production/test never read a file: production gets its values from the platform's secrets.
function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env file: fine, the variables may come from the shell
  }
}

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => {
        loadDotEnv();
        return parseEnv(process.env);
      },
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
