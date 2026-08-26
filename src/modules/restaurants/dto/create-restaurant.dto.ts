import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { NormalizePhone, TrimString } from '../../../common/transforms';

/**
 * `ownerId` is absent by design — the owner is the authenticated caller, taken
 * from the access token and never from the body.
 */
export class CreateRestaurantDto {
  @ApiProperty({ example: 'Ember Grill', minLength: 2, maxLength: 120 })
  @IsString()
  @TrimString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(0, 1000)
  description?: string;

  @ApiProperty({ example: '221B Baker Street', minLength: 5, maxLength: 200 })
  @IsString()
  @TrimString()
  @Length(5, 200)
  addressLine: string;

  @ApiProperty({ example: 'London', minLength: 2, maxLength: 80 })
  @IsString()
  @TrimString()
  @Length(2, 80)
  city: string;

  @ApiPropertyOptional({ example: '+442071234567' })
  @IsOptional()
  @IsString()
  @NormalizePhone()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be in E.164 format, e.g. +442071234567',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Delivery fee in cents',
    example: 299,
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'deliveryFeeCents must be an integer number of cents' })
  @Min(0)
  @Max(100_000)
  deliveryFeeCents?: number;
}
