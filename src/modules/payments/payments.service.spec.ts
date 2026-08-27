import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const CUSTOMER: AuthenticatedUser = {
  id: 'customer-1',
  email: 'sam@example.com',
  role: 'customer',
};
const COURIER: AuthenticatedUser = {
  id: 'courier-1',
  email: 'courier@example.com',
  role: 'courier',
};

const KEY = '11111111-1111-1111-1111-111111111111';

function anOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: CUSTOMER.id,
    status: 'pending',
    totalCents: 2349,
    ...overrides,
  };
}

function aPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    customerId: CUSTOMER.id,
    idempotencyKey: KEY,
    amountCents: 2349,
    currency: 'GBP',
    status: 'pending',
    provider: 'fake',
    providerRef: null,
    failureReason: null,
    capturedAt: null,
    refundedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PaymentsService', () => {
  let service: PaymentsService;

  const repository = {
    findByOrder: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    createPending: jest.fn(),
    markCaptured: jest.fn(),
    markFailed: jest.fn(),
    markRefunded: jest.fn(),
    updateStatus: jest.fn(),
  };
  const orders = { getById: jest.fn() };
  const provider = {
    name: 'fake',
    authorize: jest.fn(),
    capture: jest.fn(),
    refund: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    provider.name = 'fake';

    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentsRepository, useValue: repository },
        { provide: OrdersService, useValue: orders },
        { provide: PAYMENT_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('charges the order total, never a client-supplied amount', async () => {
    orders.getById.mockResolvedValue(anOrder());
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.findByOrder.mockResolvedValue(null);
    repository.createPending.mockImplementation((v: Record<string, unknown>) =>
      Promise.resolve(aPayment(v)),
    );
    provider.authorize.mockResolvedValue({ ok: true, providerRef: 'fake_1' });
    provider.capture.mockResolvedValue({ ok: true, providerRef: 'fake_1' });
    repository.markCaptured.mockResolvedValue(aPayment({ status: 'captured' }));

    await service.pay(CUSTOMER, 'order-1', { idempotencyKey: KEY });

    const [written] = repository.createPending.mock.calls[0] as [{ amountCents: number }];
    expect(written.amountCents).toBe(2349);
    expect(provider.authorize).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2349 }));
  });

  it('returns the original result on a retry instead of charging twice', async () => {
    // The classic case: the client timed out and retried with the same key.
    repository.findByIdempotencyKey.mockResolvedValue(aPayment({ status: 'captured' }));

    const result = await service.pay(CUSTOMER, 'order-1', { idempotencyKey: KEY });

    expect(result.status).toBe('captured');
    expect(provider.authorize).not.toHaveBeenCalled();
    expect(repository.createPending).not.toHaveBeenCalled();
  });

  it('hands back the winner when two requests race on the same key', async () => {
    orders.getById.mockResolvedValue(anOrder());
    // Nothing on the first read — both requests get this far.
    repository.findByIdempotencyKey.mockResolvedValueOnce(null);
    repository.findByOrder.mockResolvedValue(null);
    repository.createPending.mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'payments_idempotency_key_unique',
      }),
    );
    // The loser then reads the winner's row rather than charging.
    repository.findByIdempotencyKey.mockResolvedValueOnce(aPayment({ status: 'captured' }));

    const result = await service.pay(CUSTOMER, 'order-1', { idempotencyKey: KEY });

    expect(result.status).toBe('captured');
    expect(provider.authorize).not.toHaveBeenCalled();
  });

  it('marks the payment failed and 409s when the card is declined', async () => {
    orders.getById.mockResolvedValue(anOrder());
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.findByOrder.mockResolvedValue(null);
    repository.createPending.mockResolvedValue(aPayment());
    provider.authorize.mockResolvedValue({ ok: false, reason: 'Card declined' });
    repository.markFailed.mockResolvedValue(
      aPayment({ status: 'failed', failureReason: 'Card declined' }),
    );

    await expect(service.pay(CUSTOMER, 'order-1', { idempotencyKey: KEY })).rejects.toThrow(
      ConflictException,
    );

    expect(repository.markFailed).toHaveBeenCalled();
    // Never captured, so the order must not be marked paid.
    expect(repository.markCaptured).not.toHaveBeenCalled();
  });

  it('refuses anyone but the customer', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    orders.getById.mockResolvedValue(anOrder());

    await expect(service.pay(COURIER, 'order-1', { idempotencyKey: KEY })).rejects.toThrow(
      ForbiddenException,
    );

    expect(repository.createPending).not.toHaveBeenCalled();
  });

  it('refuses to refund a payment on an order that is not cancelled', async () => {
    orders.getById.mockResolvedValue(anOrder({ status: 'delivered' }));
    repository.findByOrder.mockResolvedValue(aPayment({ status: 'captured' }));

    await expect(service.refund(CUSTOMER, 'order-1')).rejects.toThrow(ConflictException);

    expect(provider.refund).not.toHaveBeenCalled();
  });
});
