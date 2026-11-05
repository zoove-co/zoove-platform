import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { ReferralService } from './referral.service';

const applySchema = z.object({ code: z.string().trim().min(4).max(20) });

@ApiTags('referral')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('referral')
export class ReferralController {
  constructor(private readonly referral: ReferralService) {}

  @Get()
  @ApiOperation({ summary: 'My referral code and how many friends joined and booked' })
  summary(@CurrentUser() user: AuthUser) { return this.referral.summary(user.id); }

  @Post('apply')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Enter a friend\'s referral code (once, before the first booking)' })
  apply(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(applySchema)) body: z.infer<typeof applySchema>) { return this.referral.apply(user.id, body.code); }
}
