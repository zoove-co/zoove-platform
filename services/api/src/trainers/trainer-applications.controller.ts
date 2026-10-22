import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { DOCUMENT_KINDS, MAX_FILE_BYTES, PAN_PATTERN, type DocumentKind } from './rules';
import { TrainerApplicationsService, type ApplicationView } from './trainer-applications.service';

const text = (max: number) => z.string().trim().min(1).max(max);

const saveSchema = z
  .object({
    firstName: text(60).optional(),
    lastName: text(60).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date').optional(),
    gender: z.enum(['female', 'male', 'other', 'prefer_not_to_say']).optional(),
    email: z.string().trim().toLowerCase().email().max(120).optional(),
    addressLine: text(200).optional(),
    addressArea: text(120).optional(),
    addressPincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode').optional(),
    specialties: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    experienceYears: z.number().int().min(0).max(60).optional(),
    languages: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    bio: z.string().trim().max(1000).optional(),
    panNumber: z.string().trim().toUpperCase().regex(PAN_PATTERN, 'Enter a valid PAN, like ABCDE1234F').optional(),
    aadhaarLast4: z.string().trim().regex(/^[0-9]{4}$/, 'Enter the last 4 digits only').optional(),
    source: z.string().trim().max(60).optional(),
  })
  .strict();

const uploadSchema = z.object({ kind: z.enum(DOCUMENT_KINDS) });
const idSchema = z.uuid();

@ApiTags('trainer-application')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('trainer-application')
export class TrainerApplicationsController {
  constructor(private readonly applications: TrainerApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'My trainer application: details, documents, what is missing, and review status' })
  get(@CurrentUser() user: AuthUser): Promise<ApplicationView> {
    return this.applications.get(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Save the application details (partial save, only the fields sent change)' })
  save(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(saveSchema)) body: z.infer<typeof saveSchema>): Promise<ApplicationView> {
    const input = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
    return this.applications.save(user.id, input);
  }

  @Post('documents')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Upload a document (JPG, PNG, WebP or PDF, up to 8 MB). A new file replaces the old one of the same kind.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: [...DOCUMENT_KINDS] }, file: { type: 'string', format: 'binary' } },
      required: ['kind', 'file'],
    },
  })
  upload(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(uploadSchema)) body: z.infer<typeof uploadSchema>,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ): Promise<ApplicationView> {
    return this.applications.upload(user.id, body.kind as DocumentKind, file);
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Remove an extra document (certificate or other). Required documents are replaced by uploading again.' })
  remove(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<ApplicationView> {
    return this.applications.removeDocument(user.id, id);
  }

  @Post('submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit for review. Needs every required detail and document, and agreement to the terms.' })
  @ApiBody({ schema: { type: 'object', properties: { agree: { type: 'boolean', example: true } }, required: ['agree'] } })
  submit(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(z.object({ agree: z.literal(true, { error: 'You must agree to the terms and privacy policy' }) }))) _body: { agree: true }, @Req() request: Request): Promise<ApplicationView> {
    return this.applications.submit(user.id, request.ip ?? null);
  }
}
