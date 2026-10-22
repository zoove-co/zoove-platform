import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { AddressesService, type Address } from './addresses.service';

const pincode = z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode');
const pin = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};
const pinPair = (value: { latitude?: number; longitude?: number }) =>
  (value.latitude === undefined) === (value.longitude === undefined);

const newAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(30),
    line: z.string().trim().min(3).max(200),
    area: z.string().trim().min(2).max(120),
    pincode,
    ...pin,
  })
  .refine(pinPair, { message: 'Send both latitude and longitude, or neither.' });

const checkSchema = z.object({ pincode, ...pin }).refine(pinPair, { message: 'Send both latitude and longitude, or neither.' });
const idSchema = z.uuid();

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'My saved addresses, default first' })
  list(@CurrentUser() user: AuthUser): Promise<Address[]> {
    return this.addresses.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Save an address. Always allowed, even outside the service area.' })
  add(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(newAddressSchema)) body: z.infer<typeof newAddressSchema>): Promise<Address> {
    return this.addresses.add(user.id, body);
  }

  @Post('serviceability')
  @HttpCode(200)
  @ApiOperation({ summary: 'Do we serve this pincode yet?' })
  async check(@Body(new ZodValidationPipe(checkSchema)) body: z.infer<typeof checkSchema>): Promise<{ serviceable: boolean }> {
    return { serviceable: await this.addresses.isServiceable(body.pincode) };
  }

  @Put(':id/default')
  @ApiOperation({ summary: 'Make this the default address' })
  setDefault(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<Address[]> {
    return this.addresses.setDefault(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an address (not allowed while a session is booked there)' })
  remove(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<Address[]> {
    return this.addresses.remove(user.id, id);
  }
}
