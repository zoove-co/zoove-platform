import { Body, Controller, Delete, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProgressProfileService, type ProgressProfile } from './progress-profile.service';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { CustomerService, type HomeData, type StreakData } from './customer.service';
import { CustomerNotificationsService, type AppNotification } from './notifications.service';

const progressSchema = z.object({
  goal: z.enum(['lose_weight', 'build_strength', 'stay_active', 'flexibility', 'stress_relief']).nullable().optional(),
  targetDaysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  heightCm: z.number().int().min(50).max(260).nullable().optional(),
  weightKg: z.number().min(20).max(400).nullable().optional(),
  healthConsent: z.boolean(),
});

const deviceSchema = z.object({ token: z.string().trim().min(10).max(300), platform: z.enum(['ios', 'android']) });

@ApiTags('customer')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CustomerController {
  constructor(
    private readonly customer: CustomerService,
    private readonly notifications: CustomerNotificationsService,
    private readonly progress: ProgressProfileService,
  ) {}

  @Get('me/progress-profile')
  @ApiOperation({ summary: 'Goal, days a week, and (with consent) height and weight' })
  getProgress(@CurrentUser() user: AuthUser): Promise<ProgressProfile> {
    return this.progress.get(user.id);
  }

  @Put('me/progress-profile')
  @ApiOperation({ summary: 'Save the progress profile. Height and weight need health-data consent.' })
  saveProgress(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(progressSchema)) body: z.infer<typeof progressSchema>): Promise<ProgressProfile> {
    return this.progress.save(user.id, body);
  }

  @Get('home')
  @ApiOperation({ summary: 'Everything the Home screen shows, in one call' })
  home(@CurrentUser() user: AuthUser): Promise<HomeData> {
    return this.customer.home(user.id);
  }

  @Get('streak')
  @ApiOperation({ summary: 'Week streak, this week and focus areas, derived from bookings' })
  streak(@CurrentUser() user: AuthUser): Promise<StreakData> {
    return this.customer.streak(user.id);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'My notifications, newest first' })
  listNotifications(@CurrentUser() user: AuthUser): Promise<AppNotification[]> {
    return this.notifications.list(user.id);
  }

  @Post('notifications/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  async markRead(@CurrentUser() user: AuthUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }

  @Post('me/devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this phone for push messages' })
  async registerDevice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(deviceSchema)) body: z.infer<typeof deviceSchema>): Promise<void> {
    await this.notifications.registerDevice(user.id, body.token, body.platform);
  }

  @Delete('me/devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop push messages to this phone (sign out)' })
  async removeDevice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(z.object({ token: z.string().trim().min(10).max(300) }))) body: { token: string }): Promise<void> {
    await this.notifications.removeDevice(user.id, body.token);
  }

  @Get('coaches/past')
  @ApiOperation({ summary: 'Coaches I have had before (empty until coaches are assigned to sessions)' })
  pastCoaches(): unknown[] {
    return this.customer.pastCoaches();
  }

}
