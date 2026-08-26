import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The opaque refresh token from a previous login',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken: string;
}
