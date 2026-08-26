import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { NormalizeEmail, NormalizePhone, TrimString } from '../../../common/transforms';

/**
 * Note the fields that are *not* here: `role` and `status`. A client cannot
 * register itself as an admin, because there is nowhere to put the value.
 */
export class RegisterDto {
  @ApiProperty({ example: 'sam@example.com', maxLength: 255 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

  @ApiProperty({
    example: 'correct horse battery',
    minLength: 10,
    maxLength: 128,
  })
  // Length over composition rules, per NIST SP 800-63B: forced symbol/digit
  // mixes push users toward predictable substitutions. The 128 ceiling keeps a
  // huge body from turning password hashing into a DoS vector.
  @IsString()
  @Length(10, 128, {
    message: 'password must be between 10 and 128 characters',
  })
  password: string;

  @ApiProperty({ example: 'Sam Rivera', minLength: 2, maxLength: 120 })
  @IsString()
  @TrimString()
  @Length(2, 120)
  fullName: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  @NormalizePhone()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be in E.164 format, e.g. +15551234567',
  })
  phone?: string;
}
