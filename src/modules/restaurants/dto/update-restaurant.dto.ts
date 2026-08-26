import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateRestaurantDto } from './create-restaurant.dto';

/**
 * `PartialType` from `@nestjs/swagger` rather than `@nestjs/mapped-types` — it
 * carries the `@ApiProperty` metadata across so the docs stay accurate.
 */
export class UpdateRestaurantDto extends PartialType(CreateRestaurantDto) {
  @ApiPropertyOptional({
    description: 'Whether the restaurant is currently accepting orders',
  })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
