import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { NormalizePhone, TrimString } from '../../../common/transforms';
import { VALIDATION } from '../../../common/messages';

/**
 * Self-service profile edits.
 *
 * Note what is absent: `role`, `status` and `email`. Privileged fields are
 * never accepted from a request body — `forbidNonWhitelisted` rejects them
 * outright, and leaving them off the DTO is the real guard.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sam Rivera', minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(2, 120)
  fullName?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  @NormalizePhone()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: VALIDATION.phone,
  })
  phone?: string;
}
