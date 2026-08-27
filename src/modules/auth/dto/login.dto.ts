import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../../common/transforms';
import { VALIDATION } from '../../../common/messages';

/**
 * Login deliberately does not re-apply the registration password policy —
 * tightening the rules later must not lock existing users out of their own
 * accounts at the validation layer.
 */
export class LoginDto {
  @ApiProperty({ example: 'sam@example.com' })
  @IsEmail({}, { message: VALIDATION.email })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

  @ApiProperty({ example: 'correct horse battery' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
