import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TrimString } from '../../../common/transforms';
import { VALIDATION } from '../../../common/messages';

export class OrderItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ minimum: 1, maximum: 50, example: 2 })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;
}

/**
 * What a customer is allowed to say about an order: which restaurant, which
 * items, how many, and where to take it.
 *
 * There is no price, subtotal, total or status field anywhere in this DTO.
 * Money is read from the menu at order time and computed server-side — a
 * client that sends `totalCents` gets a 400, not a discount.
 */
export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  restaurantId: string;

  @ApiProperty({ type: [OrderItemInputDto], minItems: 1, maxItems: 50 })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  @ArrayMinSize(1, { message: VALIDATION.orderNeedsItems })
  @ArrayMaxSize(50)
  items: OrderItemInputDto[];

  @ApiProperty({ example: '10 Downing Street, London', maxLength: 300 })
  @IsString()
  @TrimString()
  @Length(5, 300)
  deliveryAddress: string;

  @ApiPropertyOptional({ example: 'Ring the bell twice', maxLength: 500 })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(0, 500)
  deliveryNotes?: string;
}
