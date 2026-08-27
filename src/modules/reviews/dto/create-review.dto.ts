import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { TrimString } from '../../../common/transforms';

/**
 * `restaurantId` and `customerId` are absent by design — both are read from the
 * order being reviewed, which the caller must already own.
 */
export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(1, 2000)
  comment?: string;
}
