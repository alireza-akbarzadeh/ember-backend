import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.query.dto';
import { ToBoolean, TrimString } from '../../../common/transforms';

export const RESTAURANT_SORTS = [
  'distance',
  'rating',
  'deliveryFee',
  'prepTime',
  'popularity',
] as const;

export type RestaurantSort = (typeof RESTAURANT_SORTS)[number];

/** `?cuisine=italian&cuisine=pizza` and `?cuisine=italian,pizza` both work. */
const toStringArray = () =>
  Transform(({ value }: { value: unknown }) => {
    const raw = Array.isArray(value) ? value : [value];

    return raw
      .filter((entry): entry is string => typeof entry === 'string')
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  });

const toNumberArray = () =>
  Transform(({ value }: { value: unknown }) => {
    const raw = Array.isArray(value) ? value : [value];

    return raw
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [entry]))
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry));
  });

export class ListRestaurantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free text over name, description and cuisine',
    example: 'sushi',
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ example: 'London' })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(2, 80)
  city?: string;

  @ApiPropertyOptional({
    description: 'Cuisine tags; a restaurant matches if it has any of them',
    example: ['italian', 'pizza'],
    isArray: true,
    type: String,
  })
  @IsOptional()
  @toStringArray()
  @IsArray()
  @IsString({ each: true })
  cuisine?: string[];

  @ApiPropertyOptional({ description: '1 to 4', isArray: true, type: Number })
  @IsOptional()
  @toNumberArray()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4, { each: true })
  priceLevel?: number[];

  @ApiPropertyOptional({ minimum: 0, maximum: 5, example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Cap on delivery fee, in cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDeliveryFeeCents?: number;

  @ApiPropertyOptional({ description: 'Only restaurants accepting orders now' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({
    description:
      'Latitude to measure from. Omit both coordinates and the caller’s default address is used.',
    example: 51.5142,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -0.0931 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Search radius in km. Only applies when a location is known.',
    default: 10,
    minimum: 0.5,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(100)
  radiusKm?: number = 10;

  @ApiPropertyOptional({
    enum: RESTAURANT_SORTS,
    description: 'Defaults to distance when a location is known, otherwise rating.',
  })
  @IsOptional()
  @IsIn(RESTAURANT_SORTS)
  sort?: RestaurantSort;
}
