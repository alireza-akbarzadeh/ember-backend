import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * Every route here is protected: the global `JwtAuthGuard` covers anything
 * not marked `@Public()`, and nothing in this controller is.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  getMe(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user’s own profile' })
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Fetch any user (admin only)' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.getProfile(id);
  }
}
