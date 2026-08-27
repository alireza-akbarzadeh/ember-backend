import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MESSAGES } from '../../common/messages';
import { isUniqueViolation } from '../../database/database.errors';
import type { Payment } from '../../database/schema/payments';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import { PaymentResponseDto, PayOrderDto } from './dto/payment.dto';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentsRepository } from './payments.repository';

/** Statuses at which an order can still be paid for. */
const PAYABLE_STATUSES = new Set(['pending']);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Charges for an order.
   *
   * The amount is the order's stored total — never anything the client sent.
   * Retrying with the same `idempotencyKey` returns the original outcome
   * rather than charging again, which is the whole reason the key exists:
   * a timeout looks identical to a failure from the client's side, so retries
   * are guaranteed and must be safe.
   */
  async pay(
    user: AuthenticatedUser,
    orderId: string,
    dto: PayOrderDto,
  ): Promise<PaymentResponseDto> {
    // A replay is the expected case, not an error — answer it before doing
    // any work at all.
    const replay = await this.payments.findByIdempotencyKey(dto.idempotencyKey);
    if (replay) return PaymentResponseDto.from(replay);

    // 404s for anyone uninvolved in the order.
    const order = await this.orders.getById(user, orderId);

    if (order.customerId !== user.id) {
      throw new ForbiddenException(MESSAGES.payments.customerOnly);
    }
    if (!PAYABLE_STATUSES.has(order.status)) {
      throw new ConflictException(MESSAGES.payments.orderNotPayable(order.status));
    }

    const existing = await this.payments.findByOrder(orderId);
    if (existing && existing.status !== 'failed') {
      throw new ConflictException(MESSAGES.payments.alreadyPaid);
    }

    const payment = await this.recordAttempt(user, order.id, order.totalCents, dto);

    return PaymentResponseDto.from(await this.charge(payment));
  }

  async getForOrder(user: AuthenticatedUser, orderId: string): Promise<PaymentResponseDto> {
    // Reuses the order's own visibility rules rather than inventing new ones.
    await this.orders.getById(user, orderId);

    const payment = await this.payments.findByOrder(orderId);
    if (!payment) throw new NotFoundException(MESSAGES.payments.notFound);

    return PaymentResponseDto.from(payment);
  }

  /**
   * Returns the money for a cancelled order.
   *
   * Restricted to cancelled orders on purpose: refunding food that is already
   * on its way is a support decision, not something an endpoint should make
   * easy.
   */
  async refund(user: AuthenticatedUser, orderId: string): Promise<PaymentResponseDto> {
    const order = await this.orders.getById(user, orderId);
    const payment = await this.payments.findByOrder(orderId);

    if (!payment) throw new NotFoundException(MESSAGES.payments.notFound);
    if (payment.status === 'refunded') {
      throw new ConflictException(MESSAGES.payments.alreadyRefunded);
    }
    if (payment.status !== 'captured' || order.status !== 'cancelled') {
      throw new ConflictException(MESSAGES.payments.notRefundable);
    }

    const outcome = await this.provider.refund(payment.providerRef ?? '', payment.amountCents);

    if (!outcome.ok) {
      // The money is still ours to return; leaving the payment captured keeps
      // that true and lets the refund be retried.
      this.logger.error(`Refund failed for payment ${payment.id}: ${outcome.reason}`);
      throw new ConflictException(MESSAGES.payments.declined(outcome.reason));
    }

    const refunded = await this.payments.markRefunded(payment.id, orderId);
    return PaymentResponseDto.from(refunded);
  }

  /**
   * Writes the attempt down before any money moves.
   *
   * If two requests race with the same key, the unique index rejects the
   * second here — before the provider is contacted — and we hand back the
   * winner's row instead of charging twice.
   */
  private async recordAttempt(
    user: AuthenticatedUser,
    orderId: string,
    amountCents: number,
    dto: PayOrderDto,
  ): Promise<Payment> {
    try {
      return await this.payments.createPending({
        orderId,
        customerId: user.id,
        idempotencyKey: dto.idempotencyKey,
        amountCents,
        provider: this.provider.name,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'payments_idempotency_key_unique')) {
        const winner = await this.payments.findByIdempotencyKey(dto.idempotencyKey);
        if (winner) return winner;
      }
      if (isUniqueViolation(error, 'payments_order_id_unique')) {
        throw new ConflictException(MESSAGES.payments.alreadyPaid);
      }
      throw error;
    }
  }

  /**
   * Authorize then capture.
   *
   * Food delivery takes the money up front, so the two run together — but they
   * stay distinct calls so "capture on delivery" is a change of sequence here,
   * not a change of schema.
   */
  private async charge(payment: Payment): Promise<Payment> {
    if (payment.status !== 'pending') return payment;

    const authorization = await this.provider.authorize({
      amountCents: payment.amountCents,
      currency: payment.currency,
      idempotencyKey: payment.idempotencyKey,
      reference: `order:${payment.orderId}`,
    });

    if (!authorization.ok) {
      const failed = await this.payments.markFailed(payment.id, authorization.reason);
      // A decline is the customer's problem to fix, not a server fault — 409,
      // and the row stays so a retry with a new key is allowed.
      throw new ConflictException(MESSAGES.payments.declined(failed.failureReason ?? ''));
    }

    const capture = await this.provider.capture(authorization.providerRef);

    if (!capture.ok) {
      // Authorized but not captured: the reservation will expire on the
      // provider's side. Logged loudly because it needs reconciliation.
      this.logger.error(
        `Capture failed after authorize for payment ${payment.id}: ${capture.reason}`,
      );
      await this.payments.updateStatus(payment.id, 'authorized');
      throw new ConflictException(MESSAGES.payments.declined(capture.reason));
    }

    return this.payments.markCaptured(payment.id, payment.orderId, capture.providerRef);
  }
}
