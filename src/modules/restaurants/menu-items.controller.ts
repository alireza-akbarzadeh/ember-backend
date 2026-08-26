import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { ListMenuItemsQueryDto } from './dto/list-menu-items.query.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuItemsService } from './menu-items.service';

@ApiTags('menu-items')
@ApiBearerAuth()
@Controller('restaurants/:restaurantId/menu-items')
export class MenuItemsController {
  constructor(private readonly menuItems: MenuItemsService) {}

  @Post()
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Add an item to a menu the caller owns' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: CreateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    return this.menuItems.create(user, restaurantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Read a restaurant’s items, optionally by section' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: ListMenuItemsQueryDto,
  ): Promise<MenuItemResponseDto[]> {
    return this.menuItems.list(user, restaurantId, query);
  }

  @Patch(':itemId')
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Update a menu item' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    return this.menuItems.update(user, restaurantId, itemId, dto);
  }

  @Delete(':itemId')
  @Roles('restaurant_owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a menu item' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.menuItems.remove(user, restaurantId, itemId);
  }
}
