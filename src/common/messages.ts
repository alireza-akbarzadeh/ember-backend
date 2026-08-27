/**
 * Every message the API sends a client, in one place.
 *
 * Nothing throws a literal string. Centralising them means wording changes,
 * tone passes and eventual translation happen here rather than by grepping
 * forty service files — and it makes accidental inconsistency visible, since
 * two names for the same idea sit next to each other.
 *
 * Rules for anything added here:
 * - Say what happened and what the caller can do about it.
 * - Never leak internals: no SQL, no table names, no constraint names, no ids
 *   the caller didn't already send.
 * - Where several failures must be indistinguishable — see `auth.invalidCredentials`
 *   — that is a security property, so reuse the constant rather than writing a
 *   more helpful variant.
 *
 * Dynamic messages are functions, so the interpolation stays here too.
 */
export const MESSAGES = {
  auth: {
    /**
     * Deliberately identical for unknown email, wrong password and a suspended
     * account. Three distinct messages would let anyone probe which addresses
     * have accounts. Do not split this into more specific variants.
     */
    invalidCredentials: 'Invalid email or password',
    required: 'Authentication required',
    accessTokenExpired: 'Access token expired',
    accountInactive: 'Account is no longer active',
    insufficientPermissions: 'Insufficient permissions',
    /** Same opacity rule: never reveal *why* a refresh token was rejected. */
    invalidRefreshToken: 'Invalid refresh token',
  },

  users: {
    notFound: 'User not found',
    emailTaken: 'Email is already registered',
    phoneTaken: 'Phone number is already registered',
    cannotChangeOwnRole: 'You cannot change your own role',
  },

  addresses: {
    /** 404 rather than 403 for someone else's address — see AddressesService. */
    notFound: 'Address not found',
  },

  restaurants: {
    notFound: 'Restaurant not found',
    notYours: 'You do not manage this restaurant',
    closed: 'This restaurant is not accepting orders',
  },

  menu: {
    itemNotFound: 'Menu item not found',
    categoryNotFound: 'Category not found',
    duplicateCategoryName: 'This restaurant already has a category with that name',
  },

  orders: {
    notFound: 'Order not found',
    notAvailableToClaim: 'This order is no longer available to claim',
    changedConcurrently: 'This order changed while you were updating it — reload and try again',
    unknownItems: (ids: string[]): string =>
      `These items are not on this restaurant's menu: ${ids.join(', ')}`,
    unavailableItems: (names: string[]): string => `Currently unavailable: ${names.join(', ')}`,
    illegalTransition: (from: string, to: string): string =>
      `An order that is ${from} cannot become ${to}`,
    transitionForbidden: (to: string): string => `You are not allowed to mark this order ${to}`,
  },

  reviews: {
    customerOnly: 'Only the customer who placed an order can review it',
    notDelivered: 'An order can be reviewed once it has been delivered',
    alreadyReviewed: 'This order has already been reviewed',
  },

  /** Fallbacks from the global exception filter. */
  generic: {
    conflict: 'Resource already exists',
    internal: 'Internal server error',
  },
} as const;

/**
 * Validation copy for `class-validator` decorators.
 *
 * Separate from MESSAGES because these describe a *field*, not an outcome, and
 * are surfaced by the global pipe rather than thrown by a service.
 */
export const VALIDATION = {
  email: 'email must be a valid email address',
  password: 'password must be between 10 and 128 characters',
  phone: 'phone must be in E.164 format, e.g. +15551234567',
  cents: (field: string): string => `${field} must be an integer number of cents`,
  oneOf: (field: string, values: readonly string[]): string =>
    `${field} must be one of: ${values.join(', ')}`,
  orderNeedsItems: 'an order must contain at least one item',
} as const;
