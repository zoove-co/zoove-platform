import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags, type ApiResponseSchemaHost } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OtpService, type VerifyResult } from './otp.service';
import { TokenService } from './token.service';

const requestSchema = z.object({ phone: z.string().min(1).max(20) });
const verifySchema = z.object({ phone: z.string().min(1).max(20), code: z.string().regex(/^\d{6}$/, 'The code has 6 digits') });
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

const tokenResponse: NonNullable<ApiResponseSchemaHost['schema']> = {
  type: 'object',
  properties: {
    token: { type: 'string', description: 'Access token (JWT). Send as Authorization: Bearer <token>.' },
    refreshToken: { type: 'string', description: 'Opaque, single use. Exchange it at /v1/auth/refresh.' },
    expiresInSeconds: { type: 'integer' },
    isNewUser: { type: 'boolean' },
  },
  required: ['token', 'refreshToken', 'expiresInSeconds'],
};

const deviceOf = (request: Request) => ({ userAgent: request.headers['user-agent'] ?? null, ip: request.ip ?? null });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  // Per-IP cap on top of the per-phone limits: stops one source from texting many numbers (SMS pumping).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a one-time code by SMS' })
  @ApiBody({ schema: { type: 'object', properties: { phone: { type: 'string', example: '+919876543210' } }, required: ['phone'] } })
  @ApiOkResponse({ schema: { type: 'object', properties: { resendAfterSeconds: { type: 'integer' } } } })
  requestOtp(@Body(new ZodValidationPipe(requestSchema)) body: z.infer<typeof requestSchema>) {
    return this.otp.request(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check the code and sign in (creates the customer on first login)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { phone: { type: 'string', example: '+919876543210' }, code: { type: 'string', example: '123456' } },
      required: ['phone', 'code'],
    },
  })
  @ApiOkResponse({ schema: tokenResponse })
  verifyOtp(@Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>, @Req() request: Request): Promise<VerifyResult> {
    return this.otp.verify(body.phone, body.code, deviceOf(request));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Swap a refresh token for a new access token and a new refresh token' })
  @ApiBody({ schema: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] } })
  @ApiOkResponse({ schema: tokenResponse })
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: z.infer<typeof refreshSchema>, @Req() request: Request) {
    return this.tokens.rotate(body.refreshToken, deviceOf(request));
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out this device' })
  @ApiBody({ schema: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] } })
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: z.infer<typeof refreshSchema>): Promise<void> {
    await this.tokens.revoke(body.refreshToken);
  }
}
