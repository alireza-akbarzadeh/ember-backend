import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

/**
 * Credential verification and token issuing.
 *
 * Reads users through UsersService; it never touches the database itself.
 */
@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}
}
