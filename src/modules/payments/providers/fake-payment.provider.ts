import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChargeRequest, PaymentProvider, ProviderOutcome } from '../payment-provider';

/**
 * Amounts that force a failure, so the unhappy paths can be exercised without
 * a provider account. Mirrors how Stripe reserves specific test card numbers.
 */
export const DECLINE_AMOUNT_CENTS = 1301;
export const INSUFFICIENT_FUNDS_AMOUNT_CENTS = 1302;

/**
 * Development payment provider.
 *
 * Approves everything except two magic amounts. It exists so the payment
 * *domain* — idempotency, state transitions, the order gate — can be built and
 * tested now, with a real provider dropping in behind the same interface once
 * there is a public URL for webhooks.
 *
 * It never moves money and never touches the network.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';

  private readonly logger = new Logger(FakePaymentProvider.name);

  authorize(request: ChargeRequest): Promise<ProviderOutcome> {
    if (request.amountCents === DECLINE_AMOUNT_CENTS) {
      return Promise.resolve({ ok: false, reason: 'Card declined' });
    }
    if (request.amountCents === INSUFFICIENT_FUNDS_AMOUNT_CENTS) {
      return Promise.resolve({ ok: false, reason: 'Insufficient funds' });
    }

    // Logged without the idempotency key: it is a client-supplied token that
    // can replay a charge, so it does not belong in logs.
    this.logger.log(
      `authorize ${request.amountCents} ${request.currency} for ${request.reference}`,
    );

    return Promise.resolve({ ok: true, providerRef: `fake_${randomUUID()}` });
  }

  capture(providerRef: string): Promise<ProviderOutcome> {
    return Promise.resolve({ ok: true, providerRef });
  }

  refund(providerRef: string, amountCents: number): Promise<ProviderOutcome> {
    this.logger.log(`refund ${amountCents} for ${providerRef}`);
    return Promise.resolve({ ok: true, providerRef });
  }
}
