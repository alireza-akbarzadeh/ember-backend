import { ApiProperty } from '@nestjs/swagger';
import type { User, UserRole, UserStatus } from '../../../database/schema/users';

/**
 * The API contract for a user — deliberately not the Drizzle row type, so
 * adding a column (or a secret) never silently widens a response.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'sam@example.com' })
  email: string;

  @ApiProperty({ nullable: true, example: '+15551234567' })
  phone: string | null;

  @ApiProperty({ example: 'Sam Rivera' })
  fullName: string;

  @ApiProperty({ enum: ['customer', 'courier', 'restaurant_owner', 'admin'] })
  role: UserRole;

  @ApiProperty({ enum: ['active', 'suspended', 'deleted'] })
  status: UserStatus;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  emailVerifiedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }
}
