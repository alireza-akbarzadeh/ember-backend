import { ApiProperty } from '@nestjs/swagger';
import type { OrderItem } from '../../../database/schema/order-items';
import type { Order, OrderStatus } from '../../../database/schema/orders';

export class OrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  menuItemId: string | null;

  @ApiProperty({ description: 'Item name as it was when ordered' })
  name: string;

  @ApiProperty({ description: 'Unit price in cents at order time' })
  unitPriceCents: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  lineTotalCents: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ format: 'uuid' })
  restaurantId: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  courierId: string | null;

  @ApiProperty({
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'],
  })
  status: OrderStatus;

  @ApiProperty()
  subtotalCents: number;

  @ApiProperty()
  deliveryFeeCents: number;

  @ApiProperty()
  totalCents: number;

  @ApiProperty()
  deliveryAddress: string;

  @ApiProperty({ nullable: true, type: String })
  deliveryNotes: string | null;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  deliveredAt: Date | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'Set when payment captures; null until then. A restaurant cannot confirm an order while this is null.',
  })
  paidAt: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  cancelledAt: Date | null;

  static from(order: OrderWithItems): OrderResponseDto {
    return {
      id: order.id,
      customerId: order.customerId,
      restaurantId: order.restaurantId,
      courierId: order.courierId,
      status: order.status,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
      })),
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
    };
  }
}
