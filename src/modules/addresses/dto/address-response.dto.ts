import { ApiProperty } from '@nestjs/swagger';
import type { Address } from '../../../database/schema/addresses';

export class AddressResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Home' })
  label: string;

  @ApiProperty({ example: '10 Downing Street' })
  line1: string;

  @ApiProperty({ nullable: true, type: String })
  line2: string | null;

  @ApiProperty({ example: 'London' })
  city: string;

  @ApiProperty({ nullable: true, type: String })
  postalCode: string | null;

  @ApiProperty({ example: 51.5034 })
  latitude: number;

  @ApiProperty({ example: -0.1276 })
  longitude: number;

  @ApiProperty()
  isDefault: boolean;

  static from(address: Address): AddressResponseDto {
    return {
      id: address.id,
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      postalCode: address.postalCode,
      latitude: address.latitude,
      longitude: address.longitude,
      isDefault: address.isDefault,
    };
  }
}
