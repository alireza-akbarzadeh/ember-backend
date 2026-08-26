import { orderStatus } from '../../database/schema/orders';
import { checkTransition, isTerminal, nextStatuses, type OrderActor } from './order-status';

describe('order status machine', () => {
  describe('the happy path', () => {
    it('walks pending -> confirmed -> preparing -> ready -> picked_up -> delivered', () => {
      const journey: Array<[string, string, OrderActor]> = [
        ['pending', 'confirmed', 'restaurant'],
        ['confirmed', 'preparing', 'restaurant'],
        ['preparing', 'ready', 'restaurant'],
        ['ready', 'picked_up', 'courier'],
        ['picked_up', 'delivered', 'courier'],
      ];

      for (const [from, to, actor] of journey) {
        expect(
          checkTransition(
            from as (typeof orderStatus.enumValues)[number],
            to as (typeof orderStatus.enumValues)[number],
            [actor],
          ),
        ).toEqual({ allowed: true });
      }
    });
  });

  describe('who may do what', () => {
    it('lets a customer cancel while the food is not yet being cooked', () => {
      expect(checkTransition('pending', 'cancelled', ['customer'])).toEqual({
        allowed: true,
      });
      expect(checkTransition('confirmed', 'cancelled', ['customer'])).toEqual({
        allowed: true,
      });
    });

    it('stops a customer cancelling once the kitchen has started', () => {
      expect(checkTransition('preparing', 'cancelled', ['customer'])).toEqual({
        allowed: false,
        reason: 'forbidden',
      });
    });

    it('stops a customer confirming their own order', () => {
      expect(checkTransition('pending', 'confirmed', ['customer'])).toEqual({
        allowed: false,
        reason: 'forbidden',
      });
    });

    it('stops a restaurant marking an order picked up', () => {
      expect(checkTransition('ready', 'picked_up', ['restaurant'])).toEqual({
        allowed: false,
        reason: 'forbidden',
      });
    });

    it('accepts any actor in the list, since one user can hold two roles', () => {
      expect(checkTransition('pending', 'confirmed', ['customer', 'restaurant'])).toEqual({
        allowed: true,
      });
    });
  });

  describe('admins', () => {
    it('may perform any transition that exists', () => {
      expect(checkTransition('ready', 'picked_up', ['admin'])).toEqual({
        allowed: true,
      });
      expect(checkTransition('preparing', 'cancelled', ['admin'])).toEqual({
        allowed: true,
      });
    });

    it('may not invent one that does not', () => {
      expect(checkTransition('cancelled', 'delivered', ['admin'])).toEqual({
        allowed: false,
        reason: 'illegal',
      });
      expect(checkTransition('pending', 'delivered', ['admin'])).toEqual({
        allowed: false,
        reason: 'illegal',
      });
    });
  });

  describe('terminal states', () => {
    it.each(['delivered', 'cancelled'] as const)('treats %s as final for everyone', (status) => {
      expect(isTerminal(status)).toBe(true);
      expect(nextStatuses(status)).toEqual([]);

      for (const target of orderStatus.enumValues) {
        expect(
          checkTransition(status, target, ['admin', 'customer', 'restaurant', 'courier']),
        ).toEqual({ allowed: false, reason: 'illegal' });
      }
    });
  });

  describe('illegal jumps', () => {
    it('refuses to skip the kitchen', () => {
      expect(checkTransition('pending', 'ready', ['restaurant'])).toEqual({
        allowed: false,
        reason: 'illegal',
      });
    });

    it('refuses to move backwards', () => {
      expect(checkTransition('ready', 'preparing', ['restaurant'])).toEqual({
        allowed: false,
        reason: 'illegal',
      });
    });

    it('reports an unknown transition as illegal, not forbidden', () => {
      // The distinction is what lets the caller answer 409 rather than 403,
      // so a client is not told to go find more permissions.
      const result = checkTransition('delivered', 'cancelled', ['customer']);

      expect(result).toEqual({ allowed: false, reason: 'illegal' });
    });
  });

  it('defines transitions for every status in the enum', () => {
    for (const status of orderStatus.enumValues) {
      expect(() => nextStatuses(status)).not.toThrow();
    }
  });
});
