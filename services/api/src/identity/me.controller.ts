import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags, type ApiResponseSchemaHost } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard';
import { UsersService, type Profile } from './users.service';

// Send only what changes. An empty lastName or email clears it. At least one field is needed.
const updateSchema = z
  .object({
    firstName: z.string().trim().min(2).max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    email: z.union([z.literal(''), z.email().max(200)]).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), { message: 'Send at least one field to change.' });

const profileSchema: NonNullable<ApiResponseSchemaHost['schema']> = {
  type: 'object',
  properties: {
    phone: { type: 'string', example: '+919876543210' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
  },
};

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in customer profile' })
  @ApiOkResponse({ schema: profileSchema })
  get(@CurrentUser() user: AuthUser): Promise<Profile> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the profile' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' } },
    },
  })
  @ApiOkResponse({ schema: profileSchema })
  update(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>): Promise<Profile> {
    return this.users.updateProfile(user.id, body);
  }
}
