/** DI token — see PaymentsModule for which adapter is bound. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  /**
   * Passed through to the provider so the *provider* also deduplicates.
   *
   * Our unique index stops a second row; this stops a second charge if our
   * write succeeded but the response never reached the client and they retry.
   */
  idempotencyKey: string;
  /** For the provider's dashboard and support tickets — never secrets. */
  reference: string;
}

export type ProviderOutcome =
  | { ok: true; providerRef: string }
  /** `reason` is shown to the customer, so it must stay free of internals. */
  | { ok: false; reason: string };

/**
 * What Ember needs from a payment processor, and nothing more.
 *
 * Deliberately narrow: everything about *deciding* to charge — eligibility,
 * amounts, idempotency, state — lives in `PaymentsService`, so swapping Stripe
 * in means writing one adapter, not revisiting the payment rules.
 *
 * Adapters must not throw for a declined card. A decline is an outcome, not an
 * exception; only genuine faults (network, misconfiguration) should throw.
 */
export interface PaymentProvider {
  readonly name: string;

  /** Reserves the money. */
  authorize(request: ChargeRequest): Promise<ProviderOutcome>;

  /** Takes previously reserved money. */
  capture(providerRef: string): Promise<ProviderOutcome>;

  /** Returns captured money. Partial refunds pass a smaller amount. */
  refund(providerRef: string, amountCents: number): Promise<ProviderOutcome>;
}
