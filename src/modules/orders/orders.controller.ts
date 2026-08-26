import {
  Body,
  Controller,
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
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Intentionally not role-gated: couriers and restaurant owners order dinner
   * like everyone else. What an account may *do with* an order is decided per
   * order, in the service.
   */
  @Post()
  @ApiOperation({ summary: 'Place an order' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orders.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List orders visible to the caller' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderResponseDto[]> {
    return this.orders.list(user, query);
  }

  /** Declared before `:id`, which would otherwise swallow this path. */
  @Get('available')
  @Roles('courier', 'admin')
  @ApiOperation({ summary: 'Ready orders no courier has claimed' })
  listAvailable(@Query() query: ListOrdersQueryDto): Promise<OrderResponseDto[]> {
    return this.orders.listAvailableForCourier(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one order the caller is involved in' })
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orders.getById(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Advance or cancel an order' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.orders.updateStatus(user, id, dto);
  }

  @Post(':id/claim')
  @Roles('courier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim a ready order for delivery' })
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orders.claim(user, id);
  }
}
