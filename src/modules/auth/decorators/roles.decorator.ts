import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../../database/schema/users';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a route to the listed roles. Coarse-grained access only —
 * ownership checks ("is this *your* order?") belong in the service.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
