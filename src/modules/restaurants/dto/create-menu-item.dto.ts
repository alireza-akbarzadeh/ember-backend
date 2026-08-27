import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { TrimString } from '../../../common/transforms';
import { VALIDATION } from '../../../common/messages';

export class CreateMenuItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Menu section this item belongs to. Must be a category of the same restaurant. Send null to leave it uncategorised.',
  })
  // `@IsOptional()` skips validation for null as well as undefined, which is
  // what lets an owner clear the category by sending null.
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ example: 'Smash Burger', minLength: 2, maxLength: 120 })
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

  @ApiProperty({
    description: 'Price in cents — integers only, never a float',
    example: 1250,
    minimum: 1,
  })
  @IsInt({ message: VALIDATION.cents('priceCents') })
  @Min(1)
  @Max(1_000_000)
  priceCents: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
