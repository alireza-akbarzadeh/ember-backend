import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { FakePaymentProvider } from './providers/fake-payment.provider';

/**
 * Payments depends on Orders, never the reverse.
 *
 * The one thing Orders needs to know — whether an order is paid for — it reads
 * from its own `paid_at` column, which PaymentsService writes. That keeps the
 * dependency one-directional instead of needing `forwardRef`.
 *
 * Swapping in Stripe is a change to this one binding.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    { provide: PAYMENT_PROVIDER, useClass: FakePaymentProvider },
  ],
})
export class PaymentsModule {}
