import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../database/database.errors';
import type { User, UserRole } from '../../database/schema/users';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersRepository } from './users.repository';

/** Everything a caller needs to create an account, already hashed. */
export interface CreateUserInput {
  email: string;
  fullName: string;
  passwordHash: string;
  phone?: string;
}

/**
 * Owns everything about a user record: lookup, creation and profile updates.
 *
 * Anything that needs a user — including AuthService — goes through here rather
 * than querying the database directly, so the persistence details stay in one
 * place.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Creates an account. The caller hashes the password; this service never
   * sees a plaintext one.
   */
  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.usersRepository.insert({
        email: input.email,
        fullName: input.fullName,
        passwordHash: input.passwordHash,
        phone: input.phone,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_unique')) {
        throw new ConflictException('Email is already registered');
      }
      if (isUniqueViolation(error, 'users_phone_unique')) {
        throw new ConflictException('Phone number is already registered');
      }
      throw error;
    }
  }

  /**
   * Full row including `passwordHash` — for credential checks only. Never
   * return the result of this straight to a client.
   */
  findByEmailForAuth(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  /** Full row, or `null`. Used by the JWT strategy to re-check the account. */
  findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async getProfile(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return UserResponseDto.from(user);
  }

  /**
   * Promotes or demotes an account. Guarded by `@Roles('admin')` on the route.
   *
   * No session revocation is needed: `JwtStrategy` reads the role from the
   * database on every request rather than trusting the claim baked into the
   * access token, so a demotion takes effect on the target's next request
   * instead of whenever their token happens to expire.
   */
  async updateRole(actor: AuthenticatedUser, id: string, role: UserRole): Promise<UserResponseDto> {
    // Self-demotion could leave the system with no admin at all, and there is
    // no self-service way back in.
    if (actor.id === id) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const user = await this.usersRepository.update(id, { role });
    if (!user) throw new NotFoundException('User not found');

    return UserResponseDto.from(user);
  }

  async updateProfile(id: string, patch: UpdateProfileDto): Promise<UserResponseDto> {
    try {
      const user = await this.usersRepository.update(id, patch);
      if (!user) throw new NotFoundException('User not found');

      return UserResponseDto.from(user);
    } catch (error) {
      if (isUniqueViolation(error, 'users_phone_unique')) {
        throw new ConflictException('Phone number is already registered');
      }
      throw error;
    }
  }
}
