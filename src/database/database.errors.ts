/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

interface PostgresError {
  code: string;
  constraint?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as { code?: unknown; constraint?: unknown };
  if (typeof candidate.code !== 'string') return null;

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
