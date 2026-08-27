import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { TrimString } from '../../../common/transforms';

/** Adding the same dish again increments the existing line. */
export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  menuItemId: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;
}

/** Sets an absolute quantity. Zero removes the line. */
export class UpdateCartItemDto {
  @ApiProperty({ minimum: 0, maximum: 50, description: '0 removes the item' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  quantity: number;
}

/**
 * Checkout carries only the delivery details. Restaurant, items, quantities
 * and every price come from the stored cart and the live menu — a client
 * cannot smuggle a cheaper basket in at the last step.
 */
export class CheckoutDto {
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
