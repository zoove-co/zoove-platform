import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import { CatalogService } from '../catalog/catalog.service';
import { PricingService } from '../catalog/pricing.service';
import { DomainError } from '../common/domain-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DatabaseService } from '../database/database.service';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { DiscountsService, type DiscountQuote } from './discounts.service';

const previewSchema = z.object({
  code: z.string().trim().min(3).max(40),
  serviceSlug: z.string().min(1).max(60),
  mode: z.enum(['instant', 'scheduled', 'demo']),
});

@ApiTags('discounts')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('discounts')
export class DiscountsController {
  constructor(
    private readonly discounts: DiscountsService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly db: DatabaseService,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check a discount code for a session and see the new total. Nothing is used up until the booking is made.' })
  async preview(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(previewSchema)) body: z.infer<typeof previewSchema>): Promise<DiscountQuote> {
    const service = await this.catalog.findService(this.db, body.serviceSlug);
    if (!service) throw new DomainError('NOT_FOUND', 'We could not find that service.');
    const list = await this.pricing.priceFor(this.db, service.id, body.mode);
    if (list === null) throw new DomainError('INTERNAL', 'No price is set for this session.');
    return this.discounts.quote(this.db, user.id, body.code, list, 'session');
  }
}
