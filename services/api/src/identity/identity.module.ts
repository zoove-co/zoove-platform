import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { APP_CONFIG, type Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { MeController } from './me.controller';
import { OtpService } from './otp.service';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { SmsProvider } from './sms/sms.provider';
import { TokenService } from './token.service';
import { UsersService } from './users.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => ({
        secret: config.JWT_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: config.ACCESS_TOKEN_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    OtpService,
    TokenService,
    UsersService,
    AuthGuard,
    // The real provider (MSG91 or similar) is chosen here from SMS_PROVIDER once it exists.
    { provide: SmsProvider, useClass: ConsoleSmsProvider },
  ],
  exports: [AuthGuard, TokenService],
})
export class IdentityModule {}
