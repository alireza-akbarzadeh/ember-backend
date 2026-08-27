import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Payment, PaymentStatus } from '../../../database/schema/payments';

/**
 * Note what a client cannot send: an amount.
 *
 * The charge is the order's stored total, which was itself computed
 * server-side from the menu. A payable amount in the request body would let
 * anyone name their own price at the last step.
 */
export class PayOrderDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'A key the client generates once per payment attempt and reuses on every retry. Retrying with the same key returns the original result instead of charging again.',
  })
  @IsUUID()
  idempotencyKey: string;
}

export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty()
  amountCents: number;

  @ApiProperty({ example: 'GBP' })
  currency: string;

  @ApiProperty({
    enum: ['pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'],
  })
  status: PaymentStatus;

  @ApiProperty({ example: 'fake' })
  provider: string;

  @ApiProperty({ nullable: true, type: String })
  failureReason: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  capturedAt: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  refundedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      failureReason: payment.failureReason,
      capturedAt: payment.capturedAt,
      refundedAt: payment.refundedAt,
      createdAt: payment.createdAt,
      // providerRef is deliberately absent: it is an internal reconciliation
      // handle, not something a customer needs or should be able to probe.
    };
  }
}
