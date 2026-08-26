import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { userRole, type UserRole } from '../../../database/schema/users';

/**
 * Admin-only. This is the only way a role ever changes — registration always
 * produces a `customer`, and no self-service endpoint accepts a role field.
 */
export class UpdateUserRoleDto {
  @ApiProperty({ enum: userRole.enumValues })
  @IsIn(userRole.enumValues, {
    message: `role must be one of: ${userRole.enumValues.join(', ')}`,
  })
  role: UserRole;
}
