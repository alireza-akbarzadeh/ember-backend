import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { TrimString } from '../../../common/transforms';

/**
 * `userId` is absent by design — an address belongs to whoever is calling.
 *
 * Coordinates are required rather than derived: geocoding is a network call
 * with its own failure modes, and doing it inside a request handler makes
 * saving an address fail whenever the geocoder is slow. The client geocodes
 * (usually from a places autocomplete the user already picked from) and sends
 * the result.
 */
export class CreateAddressDto {
  @ApiProperty({ example: 'Home', maxLength: 40 })
  @IsString()
  @TrimString()
  @Length(1, 40)
  label: string;

  @ApiProperty({ example: '10 Downing Street' })
  @IsString()
  @TrimString()
  @Length(3, 200)
  line1: string;

  @ApiPropertyOptional({ example: 'Flat 2' })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(0, 200)
  line2?: string;

  @ApiProperty({ example: 'London' })
  @IsString()
  @TrimString()
  @Length(2, 80)
  city: string;

  @ApiPropertyOptional({ example: 'SW1A 2AA' })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(2, 20)
  postalCode?: string;

  @ApiProperty({ example: 51.5034 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: -0.1276 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Make this the address used for nearby search',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
