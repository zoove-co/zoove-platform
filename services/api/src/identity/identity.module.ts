import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { APP_CONFIG, type Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { MeController } from './me.controller';
import { OtpService } from './otp.service';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { Msg91SmsProvider } from './sms/msg91-sms.provider';
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
    ConsoleSmsProvider,
    Msg91SmsProvider,
    {
      provide: SmsProvider,
      inject: [APP_CONFIG, ConsoleSmsProvider, Msg91SmsProvider],
      useFactory: (config: Env, consoleProvider: ConsoleSmsProvider, msg91: Msg91SmsProvider) =>
        config.SMS_PROVIDER === 'msg91' ? msg91 : consoleProvider,
    },
  ],
  exports: [AuthGuard, TokenService],
})
export class IdentityModule {}
