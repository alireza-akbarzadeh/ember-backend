import { isUniqueViolation } from './database.errors';

/** What `pg` throws. */
function pgUniqueViolation(constraint: string): Error {
  return Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint,
  });
}

/** What Drizzle actually surfaces — the driver error hidden behind `cause`. */
function drizzleWrapped(inner: Error): Error {
  return Object.assign(new Error('Failed query: insert into "users" ...'), {
    cause: inner,
  });
}

describe('isUniqueViolation', () => {
  it('recognises a bare driver error', () => {
    expect(isUniqueViolation(pgUniqueViolation('users_email_unique'))).toBe(true);
  });

  it('sees through Drizzle’s wrapper', () => {
    // The case that mattered: every 409 in the app returned 500 because the
    // real error was one level down.
    const error = drizzleWrapped(pgUniqueViolation('users_email_unique'));

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, 'users_email_unique')).toBe(true);
    expect(isUniqueViolation(error, 'some_other_index')).toBe(false);
  });

  it('ignores errors that are not unique violations', () => {
    const notNull = Object.assign(new Error('null value'), { code: '23502' });

    expect(isUniqueViolation(drizzleWrapped(notNull))).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it('terminates on a self-referencing cause', () => {
    const looping: { cause?: unknown } = {};
    looping.cause = looping;

    expect(() => isUniqueViolation(looping)).not.toThrow();
    expect(isUniqueViolation(looping)).toBe(false);
  });
});
