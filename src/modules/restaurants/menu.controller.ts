import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RestaurantMenuResponseDto } from './dto/restaurant-menu-response.dto';
import { MenuService } from './menu.service';

@ApiTags('menu')
@ApiBearerAuth()
@Controller('restaurants/:restaurantId/menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @ApiOperation({
    summary: 'The full restaurant page: details, sections and their items',
  })
  getMenu(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<RestaurantMenuResponseDto> {
    return this.menu.getMenu(user, restaurantId);
  }
}
