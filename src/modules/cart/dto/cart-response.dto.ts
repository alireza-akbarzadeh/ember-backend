import { ApiProperty } from '@nestjs/swagger';

export class CartLineDto {
  @ApiProperty({ format: 'uuid' })
  menuItemId: string;

  @ApiProperty({ example: 'Smash Burger' })
  name: string;

  @ApiProperty({ description: 'Live price from the menu, in cents' })
  unitPriceCents: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  lineTotalCents: number;

  @ApiProperty({
    description:
      'False when the restaurant has since marked the dish sold out. The line stays visible so the customer can see what changed.',
  })
  isAvailable: boolean;
}

/**
 * The basket as it stands *right now*.
 *
 * Every price is read from the menu on each request rather than stored, so a
 * restaurant changing a price is reflected before the customer commits to it,
 * not discovered on the receipt.
 */
export class CartResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  id: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  restaurantId: string | null;

  @ApiProperty({ nullable: true, type: String })
  restaurantName: string | null;

  @ApiProperty({ type: [CartLineDto] })
  items: CartLineDto[];

  @ApiProperty({ description: 'Available lines only' })
  subtotalCents: number;

  @ApiProperty()
  deliveryFeeCents: number;

  @ApiProperty()
  totalCents: number;

  @ApiProperty({ description: "The restaurant's minimum order, in cents" })
  minimumOrderCents: number;

  @ApiProperty({
    description:
      'Whether checkout would succeed: at least one available item, and the subtotal meets the minimum.',
  })
  canCheckout: boolean;

  @ApiProperty({
    isArray: true,
    type: String,
    description: 'Why checkout is blocked, empty when it is not',
  })
  blockers: string[];
}
