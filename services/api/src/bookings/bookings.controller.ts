import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { BookingsService, type Booking, type TimeSlot } from './bookings.service';

const idSchema = z.uuid();

const createSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(60),
  formatSlug: z.string().trim().min(1).max(60),
  mode: z.enum(['instant', 'scheduled', 'demo']),
  // Duo, Loved one and Group are not open yet (questions 5, 8, 9), so only Personal is accepted.
  participant: z.literal('personal').default('personal'),
  addressId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  preferredCoachId: z.uuid().optional(),
  idempotencyKey: z.string().min(8).max(100),
});
const rescheduleSchema = z.object({ startsAt: z.iso.datetime({ offset: true }) });
const slotsSchema = z.object({ service: z.string().trim().min(1).max(60), date: z.string() });

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('slots')
  @ApiOperation({ summary: 'Start times for one day (India time), marked available or not' })
  slots(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(slotsSchema)) query: z.infer<typeof slotsSchema>): Promise<TimeSlot[]> {
    return this.bookings.slots(user.id, query.service, query.date);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Book a session. The same idempotencyKey always returns the same booking.' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>): Promise<Booking> {
    return this.bookings.create(user.id, body);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'My bookings, newest first' })
  list(@CurrentUser() user: AuthUser): Promise<Booking[]> {
    return this.bookings.list(user.id);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'One booking' })
  get(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<Booking> {
    return this.bookings.get(user.id, id);
  }

  @Post('bookings/:id/reschedule')
  @ApiOperation({ summary: 'Move a session to another start time' })
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(rescheduleSchema)) body: z.infer<typeof rescheduleSchema>,
  ): Promise<Booking> {
    return this.bookings.reschedule(user.id, id, body.startsAt);
  }

  @Post('bookings/:id/cancel')
  @ApiOperation({ summary: 'Cancel a session' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<Booking> {
    return this.bookings.cancel(user.id, id);
  }
}
