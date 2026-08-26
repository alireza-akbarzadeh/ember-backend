import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  // UsersRepository is intentionally not exported — cross-module access to
  // users goes through UsersService.
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
