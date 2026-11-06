import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { TrainerJobsService } from './trainer-jobs.service';

const idSchema = z.uuid();
const availabilitySchema = z.object({ acceptingJobs: z.boolean() });
const noteSchema = z.object({ note: z.string().trim().max(2000) });
const codeSchema = z.object({ code: z.string().regex(/^\d{4}$/, 'The code is 4 digits.') });
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

// For signed-in trainers only (the service refuses anyone who is not an active trainer).
@ApiTags('trainer-jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('trainer/jobs')
export class TrainerJobsController {
  constructor(private readonly jobs: TrainerJobsService) {}

  @Get()
  @ApiOperation({ summary: 'Open jobs nobody has taken, and my own upcoming sessions' })
  board(@CurrentUser() user: AuthUser) { return this.jobs.board(user.id); }

  @Put('availability')
  @ApiOperation({ summary: 'Switch on or off: off means no new sessions are offered to me' })
  availability(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(availabilitySchema)) body: z.infer<typeof availabilitySchema>) { return this.jobs.setAccepting(user.id, body.acceptingJobs); }

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take an open job (first to accept gets it)' })
  accept(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.jobs.accept(user.id, id); }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'I cannot make a session I was given: it goes back to open and the customer and ops are told' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return this.jobs.cancel(user.id, id, body.reason);
  }

  @Post(':id/check-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Arrived: enter the start code the customer shows. The session goes live.' })
  checkIn(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(codeSchema)) body: z.infer<typeof codeSchema>) { return this.jobs.enterCode(user.id, id, 'start', body.code); }

  @Post(':id/check-out')
  @HttpCode(200)
  @ApiOperation({ summary: 'Training done: enter the finish code the customer shows. The session is completed.' })
  checkOut(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(codeSchema)) body: z.infer<typeof codeSchema>) { return this.jobs.enterCode(user.id, id, 'end', body.code); }

  @Put(':id/note')
  @ApiOperation({ summary: 'My private note on a session I hold or finished (empty text removes it)' })
  note(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(noteSchema)) body: z.infer<typeof noteSchema>) { return this.jobs.saveNote(user.id, id, body.note); }
}
