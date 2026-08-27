import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.query.dto';
import { TrimString } from '../../../common/transforms';
import {
  userRole,
  userStatus,
  type UserRole,
  type UserStatus,
} from '../../../database/schema/users';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free text over name and email',
    example: 'sam',
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ enum: userRole.enumValues })
  @IsOptional()
  @IsIn(userRole.enumValues)
  role?: UserRole;

  @ApiPropertyOptional({ enum: userStatus.enumValues })
  @IsOptional()
  @IsIn(userStatus.enumValues)
  status?: UserStatus;
}
