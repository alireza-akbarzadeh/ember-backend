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
import type { OrderResponseDto } from '../orders/dto/order-response.dto';
import { CartService } from './cart.service';
import { AddCartItemDto, CheckoutDto, UpdateCartItemDto } from './dto/cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';

/**
 * Always the caller's own basket — there is no route to anyone else's, and no
 * cart id in any path.
 *
 * Every mutation returns the whole recalculated cart, so a client never has to
 * follow a write with a read to refresh its totals.
 */
@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'The basket, priced against the current menu' })
  view(@CurrentUser() user: AuthenticatedUser): Promise<CartResponseDto> {
    return this.cart.view(user);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a dish, or add to one already in the basket' })
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cart.addItem(user, dto);
  }

  @Patch('items/:menuItemId')
  @ApiOperation({ summary: 'Set an exact quantity; 0 removes the line' })
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cart.updateItem(user, menuItemId, dto);
  }

  @Delete('items/:menuItemId')
  @ApiOperation({ summary: 'Remove a line from the basket' })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
  ): Promise<CartResponseDto> {
    return this.cart.removeItem(user, menuItemId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Empty the basket — needed to order elsewhere' })
  clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.cart.clear(user);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Place the basket as an order and empty it' })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
  ): Promise<OrderResponseDto> {
    return this.cart.checkout(user, dto);
  }
}
