import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { TrainerJobsService } from './trainer-jobs.service';

const idSchema = z.uuid();
const noteSchema = z.object({ note: z.string().trim().max(2000) });
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

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'The session happened: mark it done' })
  complete(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.jobs.complete(user.id, id); }

  @Put(':id/note')
  @ApiOperation({ summary: 'My private note on a session I hold or finished (empty text removes it)' })
  note(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(noteSchema)) body: z.infer<typeof noteSchema>) { return this.jobs.saveNote(user.id, id, body.note); }
}
