import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { MESSAGE_MAX } from './complaints.rules';
import { ComplaintsService } from './complaints.service';

const idSchema = z.uuid();
const text = z.string().trim().min(1).max(MESSAGE_MAX);
const createSchema = z.object({ category: z.string().min(1).max(60), bookingId: z.uuid().optional(), message: z.string().trim().min(5, 'Please tell us a little more.').max(MESSAGE_MAX), idempotencyKey: z.string().min(8).max(100) });
const messageSchema = z.object({ body: text });
const noteSchema = z.object({ note: z.string().trim().min(3, 'Write what you did or agreed, so the person can read it.').max(1000) });
const assignSchema = z.object({ assigneeId: z.uuid().nullable() });
const listSchema = z.object({
  side: z.enum(['customer', 'trainer']).optional(),
  status: z.enum(['active', 'open', 'waiting_on_user', 'resolved', 'all']).default('active'),
  q: z.string().trim().max(80).optional(),
  mine: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// The customer app. A customer sees only their own complaints.
@ApiTags('complaints')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('complaints')
export class CustomerComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'What a customer can complain about' })
  categories() { return this.complaints.categories('customer'); }

  @Get('sessions')
  @ApiOperation({ summary: 'My recent sessions, to pick the one a complaint is about' })
  sessions(@CurrentUser() user: AuthUser) { return this.complaints.sessions(user.id, 'customer'); }

  @Get('unread')
  @ApiOperation({ summary: 'How many complaints have a reply I have not read' })
  unread(@CurrentUser() user: AuthUser) { return this.complaints.unreadCount(user.id, 'customer'); }

  @Get()
  @ApiOperation({ summary: 'My complaints: open ones and past ones' })
  mine(@CurrentUser() user: AuthUser) { return this.complaints.mine(user.id, 'customer'); }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Raise a complaint. It opens a thread with the Zoove team.' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) { return this.complaints.create(user.id, 'customer', body); }

  @Get(':id')
  @ApiOperation({ summary: 'One complaint with its whole thread' })
  open(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.complaints.open(user.id, 'customer', id); }

  @Post(':id/messages')
  @HttpCode(200)
  @ApiOperation({ summary: 'Write in the thread' })
  reply(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>) { return this.complaints.reply(user.id, 'customer', id, body.body); }
}

// The trainer app. A trainer sees only their own complaints, kept apart from any customer's complaint about the same session.
@ApiTags('trainer-complaints')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('trainer/complaints')
export class TrainerComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get('categories')
  categories() { return this.complaints.categories('trainer'); }

  @Get('sessions')
  @ApiOperation({ summary: 'Sessions I was given recently, to pick the one a complaint is about' })
  sessions(@CurrentUser() user: AuthUser) { return this.complaints.sessions(user.id, 'trainer'); }

  @Get('unread')
  unread(@CurrentUser() user: AuthUser) { return this.complaints.unreadCount(user.id, 'trainer'); }

  @Get()
  mine(@CurrentUser() user: AuthUser) { return this.complaints.mine(user.id, 'trainer'); }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) { return this.complaints.create(user.id, 'trainer', body); }

  @Get(':id')
  open(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.complaints.open(user.id, 'trainer', id); }

  @Post(':id/messages')
  @HttpCode(200)
  reply(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>) { return this.complaints.reply(user.id, 'trainer', id, body.body); }
}

// The admin site. Which side (customer or trainer) an admin may handle is checked inside, from their permissions.
@ApiTags('admin-complaints')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/complaints')
export class AdminComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'How many complaints wait for the team, and how many are urgent' })
  summary(@CurrentUser() user: AuthUser) { return this.complaints.summary(user.id); }

  @Get('assignees')
  assignees(@CurrentUser() user: AuthUser) { return this.complaints.assignees(user.id); }

  @Get('by-session/:bookingId')
  bySession(@CurrentUser() user: AuthUser, @Param('bookingId', new ZodValidationPipe(idSchema)) bookingId: string) { return this.complaints.forSession(user.id, bookingId); }

  @Get('by-person/:userId')
  byPerson(@CurrentUser() user: AuthUser, @Param('userId', new ZodValidationPipe(idSchema)) userId: string) { return this.complaints.forPerson(user.id, userId); }

  @Get()
  @ApiOperation({ summary: 'The inbox: waiting-for-us first, urgent first, oldest first' })
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.complaints.list(user.id, query); }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.complaints.get(user.id, id); }

  @Post(':id/reply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reply to the person. They are notified.' })
  reply(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>) { return this.complaints.adminReply(user.id, id, body.body); }

  @Post(':id/note')
  @HttpCode(200)
  @ApiOperation({ summary: 'A note for the team. The person never sees it.' })
  note(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>) { return this.complaints.adminNote(user.id, id, body.body); }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(assignSchema)) body: z.infer<typeof assignSchema>) { return this.complaints.adminAssign(user.id, id, body.assigneeId); }

  @Post(':id/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close the complaint. The note is shown to the person as the last message.' })
  resolve(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(noteSchema)) body: z.infer<typeof noteSchema>) { return this.complaints.adminResolve(user.id, id, body.note); }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.complaints.adminReopen(user.id, id); }
}
