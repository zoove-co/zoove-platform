import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { CustomerService, type HomeData, type StreakData } from './customer.service';
import { CustomerNotificationsService, type AppNotification } from './notifications.service';

@ApiTags('customer')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CustomerController {
  constructor(
    private readonly customer: CustomerService,
    private readonly notifications: CustomerNotificationsService,
  ) {}

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

  @Get('coaches/past')
  @ApiOperation({ summary: 'Coaches I have had before (empty until coaches are assigned to sessions)' })
  pastCoaches(): unknown[] {
    return this.customer.pastCoaches();
  }

  @Get('packages')
  @ApiOperation({ summary: 'Session packages (empty until packages are defined in the admin panel)' })
  packages(): unknown[] {
    return this.customer.packages();
  }
}
