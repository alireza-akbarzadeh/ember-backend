import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { orderStatus, type OrderStatus } from '../../../database/schema/orders';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: orderStatus.enumValues })
  @IsIn(orderStatus.enumValues, {
    message: `status must be one of: ${orderStatus.enumValues.join(', ')}`,
  })
  status: OrderStatus;
}
