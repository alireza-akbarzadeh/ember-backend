import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentResponseDto, PayOrderDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

/** Payments hang off the order they settle, so every route is nested under it. */
@ApiTags('payments')
@ApiBearerAuth()
@Controller('orders/:orderId/payment')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Pay for an order',
    description:
      'The amount is the order total; there is no amount field. Safe to retry with the same idempotencyKey — the original result comes back rather than a second charge.',
  })
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PayOrderDto,
  ): Promise<PaymentResponseDto> {
    return this.payments.pay(user, orderId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'The payment for an order' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentResponseDto> {
    return this.payments.getForOrder(user, orderId);
  }

  @Post('refund')
  @ApiOperation({ summary: 'Refund a captured payment on a cancelled order' })
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentResponseDto> {
    return this.payments.refund(user, orderId);
  }
}
