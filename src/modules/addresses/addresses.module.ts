import { Module } from '@nestjs/common';
import { AddressesController } from './addresses.controller';
import { AddressesRepository } from './addresses.repository';
import { AddressesService } from './addresses.service';

@Module({
  controllers: [AddressesController],
  providers: [AddressesService, AddressesRepository],
  // Restaurants needs the caller's default address to rank by distance.
  exports: [AddressesService],
})
export class AddressesModule {}
