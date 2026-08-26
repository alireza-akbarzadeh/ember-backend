import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ description: 'Short-lived JWT for the Authorization header' })
  accessToken: string;

  @ApiProperty({ description: 'Opaque token; rotates on every use' })
  refreshToken: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
