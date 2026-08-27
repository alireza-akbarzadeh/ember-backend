/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

interface PostgresError {
  code: string;
  constraint?: string;
}

/**
 * Finds the driver error, however deeply it has been wrapped.
 *
 * Drizzle does not rethrow the `pg` error directly — it raises its own
 * `Failed query: ...` Error and hangs the original off `cause`. Inspecting
 * only the top level misses every constraint violation, silently turning what
 * should be a 409 into a 500, so this walks the chain.
 */
function asPostgresError(error: unknown, depth = 0): PostgresError | null {
  // Depth guard: a self-referencing `cause` would otherwise loop forever, and
  // no genuine chain is this deep.
  if (typeof error !== 'object' || error === null || depth > 5) return null;

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };

  if (typeof candidate.code !== 'string') {
    return asPostgresError(candidate.cause, depth + 1);
  }

  return {
    code: candidate.code,
    constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
  };
}

/**
 * True when the driver rejected a write because it collided with a unique
 * index. Pass `constraint` to match one specific index.
 *
 * Relying on the constraint rather than a pre-flight `SELECT` closes the race
 * between checking and inserting.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);
  if (!pgError || pgError.code !== UNIQUE_VIOLATION) return false;

  return constraint === undefined || pgError.constraint === constraint;
}
