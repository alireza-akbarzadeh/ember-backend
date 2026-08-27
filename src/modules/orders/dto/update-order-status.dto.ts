import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { orderStatus, type OrderStatus } from '../../../database/schema/orders';
import { VALIDATION } from '../../../common/messages';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: orderStatus.enumValues })
  @IsIn(orderStatus.enumValues, {
    message: VALIDATION.oneOf('status', orderStatus.enumValues),
  })
  status: OrderStatus;
}
