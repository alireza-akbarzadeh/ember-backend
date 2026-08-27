import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paginate, type PaginatedDto } from '../../common/dto/paginated.dto';
import { isUniqueViolation } from '../../database/database.errors';
import type { User, UserRole } from '../../database/schema/users';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersRepository } from './users.repository';
import { MESSAGES } from '../../common/messages';

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
        throw new ConflictException(MESSAGES.users.emailTaken);
      }
      if (isUniqueViolation(error, 'users_phone_unique')) {
        throw new ConflictException(MESSAGES.users.phoneTaken);
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
  /**
   * Every user in the app, filtered, searched and paginated.
   *
   * Admin-only at the route, and deliberately so: the rows carry email,
   * phone and role, so an unrestricted version would let any signed-in
   * customer download the entire user base. Mapped through `UserResponseDto`
   * so `passwordHash` cannot ride along.
   */
  async usersList(query: ListUsersQueryDto): Promise<PaginatedDto<UserResponseDto>> {
    const { rows, total } = await this.usersRepository.search({
      search: query.search,
      role: query.role,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return paginate(
      rows.map((row) => UserResponseDto.from(row)),
      total,
      query.limit,
      query.offset,
    );
  }

  /** Full row, or `null`. Used by the JWT strategy to re-check the account. */
  findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async getProfile(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException(MESSAGES.users.notFound);

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
      throw new ForbiddenException(MESSAGES.users.cannotChangeOwnRole);
    }

    const user = await this.usersRepository.update(id, { role });
    if (!user) throw new NotFoundException(MESSAGES.users.notFound);

    return UserResponseDto.from(user);
  }

  async updateProfile(id: string, patch: UpdateProfileDto): Promise<UserResponseDto> {
    try {
      const user = await this.usersRepository.update(id, patch);
      if (!user) throw new NotFoundException(MESSAGES.users.notFound);

      return UserResponseDto.from(user);
    } catch (error) {
      if (isUniqueViolation(error, 'users_phone_unique')) {
        throw new ConflictException(MESSAGES.users.phoneTaken);
      }
      throw error;
    }
  }
}
