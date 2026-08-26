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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { MenuCategoryResponseDto } from './dto/menu-category-response.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { MenuCategoriesService } from './menu-categories.service';

@ApiTags('menu-categories')
@ApiBearerAuth()
@Controller('restaurants/:restaurantId/categories')
export class MenuCategoriesController {
  constructor(private readonly categories: MenuCategoriesService) {}

  @Post()
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Add a section to a menu the caller owns' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: CreateMenuCategoryDto,
  ): Promise<MenuCategoryResponseDto> {
    return this.categories.create(user, restaurantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List a restaurant’s menu sections' })
  list(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<MenuCategoryResponseDto[]> {
    return this.categories.list(restaurantId);
  }

  @Patch(':categoryId')
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Rename or reorder a menu section' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategoryResponseDto> {
    return this.categories.update(user, restaurantId, categoryId, dto);
  }

  /** Items in the section survive — they fall back to uncategorised. */
  @Delete(':categoryId')
  @Roles('restaurant_owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a menu section' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    return this.categories.remove(user, restaurantId, categoryId);
  }
}
