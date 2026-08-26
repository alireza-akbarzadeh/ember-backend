import { Injectable } from '@nestjs/common';

/**
 * Owns everything about a user record: lookup, creation and profile updates.
 *
 * Anything that needs a user — including AuthService — goes through here rather
 * than querying the database directly, so the persistence details stay in one
 * place.
 */
@Injectable()
export class UsersService {}
