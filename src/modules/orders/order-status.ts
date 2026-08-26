import type { OrderStatus } from '../../database/schema/orders';

/**
 * Who the caller is *relative to a specific order* — not their account role.
 * A user with the `courier` role is only a `courier` actor on the orders they
 * were actually assigned.
 */
export type OrderActor = 'customer' | 'restaurant' | 'courier' | 'admin';

interface Transition {
  readonly to: OrderStatus;
  readonly by: readonly OrderActor[];
}

/**
 * The whole order lifecycle in one table.
 *
 * Keeping it declarative means an illegal transition is impossible to express
 * rather than something each endpoint has to remember to check, and adding a
 * status is a data change rather than a hunt through service methods.
 *
 * `admin` is deliberately absent from every `by` list: an admin may perform
 * any transition that exists, but cannot invent one that doesn't — a support
 * agent should not be able to mark a cancelled order delivered.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly Transition[]>> = {
  pending: [
    { to: 'confirmed', by: ['restaurant'] },
    { to: 'cancelled', by: ['customer', 'restaurant'] },
  ],
  confirmed: [
    { to: 'preparing', by: ['restaurant'] },
    // The customer's last chance to back out; once food is being cooked the
    // restaurant is the only one who can stop it.
    { to: 'cancelled', by: ['customer', 'restaurant'] },
  ],
  preparing: [
    { to: 'ready', by: ['restaurant'] },
    { to: 'cancelled', by: ['restaurant'] },
  ],
  ready: [{ to: 'picked_up', by: ['courier'] }],
  picked_up: [{ to: 'delivered', by: ['courier'] }],
  delivered: [],
  cancelled: [],
};

export type TransitionCheck =
  | { allowed: true }
  /** The transition does not exist for this status. */
  | { allowed: false; reason: 'illegal' }
  /** The transition exists, but not for this actor. */
  | { allowed: false; reason: 'forbidden' };

/**
 * Separating "illegal" from "forbidden" is what lets the caller answer 409 vs
 * 403 correctly — collapsing them would tell a customer that cancelling a
 * delivered order is a permissions problem they could escalate.
 */
export function checkTransition(
  from: OrderStatus,
  to: OrderStatus,
  actors: readonly OrderActor[],
): TransitionCheck {
  const transition = TRANSITIONS[from].find((candidate) => candidate.to === to);

  if (!transition) return { allowed: false, reason: 'illegal' };
  if (actors.includes('admin')) return { allowed: true };

  const permitted = transition.by.some((actor) => actors.includes(actor));
  return permitted ? { allowed: true } : { allowed: false, reason: 'forbidden' };
}

/** Statuses an order can still move to, ignoring who is asking. */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from].map((transition) => transition.to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
