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
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants.query.dto';
import { RestaurantResponseDto } from './dto/restaurant-response.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantsService } from './restaurants.service';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post()
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Create a restaurant owned by the caller' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRestaurantDto,
  ): Promise<RestaurantResponseDto> {
    return this.restaurants.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Browse restaurants' })
  list(@Query() query: ListRestaurantsQueryDto): Promise<RestaurantResponseDto[]> {
    return this.restaurants.list(query);
  }

  /**
   * Declared before `:id` — Nest matches routes in declaration order, so the
   * other way round this would be read as a restaurant with the id "mine".
   */
  @Get('mine')
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Restaurants the caller owns' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRestaurantsQueryDto,
  ): Promise<RestaurantResponseDto[]> {
    return this.restaurants.listOwnedBy(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one restaurant' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<RestaurantResponseDto> {
    return this.restaurants.getById(id);
  }

  @Patch(':id')
  @Roles('restaurant_owner', 'admin')
  @ApiOperation({ summary: 'Update a restaurant the caller owns' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
  ): Promise<RestaurantResponseDto> {
    return this.restaurants.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('restaurant_owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a restaurant the caller owns' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.restaurants.remove(user, id);
  }
}
