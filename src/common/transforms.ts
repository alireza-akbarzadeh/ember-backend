import { Transform } from 'class-transformer';

/**
 * Input normalisers, applied by the global `ValidationPipe` before validation.
 *
 * Each one leaves non-string input untouched so the accompanying
 * `class-validator` rule produces the error message, rather than this throwing
 * on a number or an object.
 */

/** Lower-cases and trims, so `Sam@Example.com ` collides with `sam@example.com`. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** Strips surrounding whitespace from free-text fields. */
export const TrimString = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Drops spaces and dashes so `+1 555-123-4567` reaches the E.164 check. */
export const NormalizePhone = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  );
