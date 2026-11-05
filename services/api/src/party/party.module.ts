import { Module } from '@nestjs/common';

import { AddressesModule } from '../addresses/addresses.module';
import { IdentityModule } from '../identity/identity.module';
import { PartyAdminController, PartyController } from './party.controller';
import { PartyService } from './party.service';

@Module({ imports: [IdentityModule, AddressesModule], controllers: [PartyController, PartyAdminController], providers: [PartyService] })
export class PartyModule {}
