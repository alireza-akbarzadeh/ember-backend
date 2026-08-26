---
name: drizzle-schema
description: Define tables, relations and migrations with Drizzle ORM in this backend, and query them from NestJS services. Use when adding or changing a database table, writing a query, generating or applying a migration, or debugging drizzle-kit output.
---

# Drizzle schema & migrations

Conventions for `food/backend` (Drizzle ORM + `pg`, PostgreSQL).

## Where schema lives

`drizzle.config.ts` points at a single `./drizzle/schema.ts`. Once more than one
table exists, convert it to a barrel so each table gets its own file — the
config glob keeps working:

```
drizzle/
├── schema.ts            # re-exports every table
├── migrations/          # generated SQL — commit it, never hand-edit
└── schema/
    ├── users.ts
    └── orders.ts
```

```ts
// drizzle/schema.ts
export * from './schema/users';
export * from './schema/orders';
```

`drizzle-kit` only sees what `schema.ts` exports. A table missing from the
barrel is silently dropped from the diff — it will generate a migration that
deletes it. Check the barrel first whenever a migration looks wrong.

## Defining a table

```ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('users_email_idx').on(table.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

House rules:

- `camelCase` in TypeScript, `snake_case` in the database — always pass the
  column name explicitly as the first argument.
- Always `timestamp(..., { withTimezone: true })`. A bare `timestamp` maps to
  `timestamp without time zone` and will corrupt delivery ETAs across DST.
- Export `$inferSelect` / `$inferInsert` types next to the table and use those
  everywhere instead of re-declaring row shapes by hand.
- Money is `integer` in the smallest currency unit, or `numeric` with explicit
  precision. Never `real` or `doublePrecision`.
- Foreign keys carry an explicit delete rule:
  `.references(() => users.id, { onDelete: 'cascade' })`.

## Relations

`references()` creates the database constraint; `relations()` is separate and
only powers the query API. Declare both, or `db.query.<table>.findMany({ with })`
will not work:

```ts
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));
```

## Migration workflow

```bash
pnpm db:generate    # diff schema -> drizzle/migrations/*.sql
pnpm db:migrate     # apply to DATABASE_URL
pnpm db:studio      # browse data
```

Always read the generated SQL before applying. `drizzle-kit` cannot distinguish
a rename from a drop-plus-add, so a renamed column arrives as `DROP COLUMN` +
`ADD COLUMN` — silent data loss. Rewrite it as `ALTER TABLE ... RENAME COLUMN`
by hand in that case.

Never edit an already-applied migration; add a new one. `DATABASE_URL` must be
present in the environment — `drizzle.config.ts` asserts it non-null and will
fail with an unhelpful connection error if it is unset.

## Querying from a NestJS service

The Drizzle client is **not wired into Nest yet**. When the first query lands,
provide it once as an injectable rather than constructing a pool per module:

```ts
export const DRIZZLE = Symbol('DRIZZLE');

// DatabaseModule — global, provides a single pool
{
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    drizzle(new Pool({ connectionString: config.getOrThrow('DATABASE_URL') }), {
      schema,
    }),
}
```

Then inject with `@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>`.

Query notes:

- `db.select()` returns an **array**. Use `.limit(1)` and destructure for single
  rows; there is no `findOne` that throws.
- Multi-statement writes go through `db.transaction(async (tx) => ...)` — use
  `tx`, not `db`, inside the callback or the statement escapes the transaction.
- Never interpolate user input into `sql``` `` — use the `${}` placeholders,
  which parameterize.
- Select explicit columns when a table holds secrets: `db.select({ id: users.id,
  email: users.email })` keeps `passwordHash` from leaking into a response.
