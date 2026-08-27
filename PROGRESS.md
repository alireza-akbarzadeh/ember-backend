# Ember — build progress

One feature at a time, each finished (schema → service → routes → tests → verified)
before the next starts. Newest work at the bottom.

Legend: ✅ done · 🚧 in progress · ⬜ not started

---

## ✅ 1. Foundation

Config, database wiring, error handling, security defaults.

- Fail-fast env validation (`src/config/env.validation.ts`) — boot dies on a bad
  environment instead of throwing 500s later
- Single Drizzle pool, drained on `SIGTERM`
- Global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`), helmet, CORS,
  rate limiting, 100kb body cap
- Global exception filter — sanitised bodies, no SQL or stack traces to clients
- `/health` (liveness) and `/health/ready` (readiness, pings the DB)
- `GET /` service index: live status, docs link, full route list
- Swagger at `/docs`, on outside production, off in production

## ✅ 2. Auth — register, login, sessions

**Working and tested end to end.**

- argon2id password hashing (OWASP params), passwords never logged or returned
- Access JWT (15m, HS256, issuer + audience verified) + opaque refresh token
  (30d, stored as SHA-256, rotating with family-based replay detection)
- **Protected by default**: `JwtAuthGuard` is a global guard; `@Public()` is the
  only opt-out, which makes open endpoints greppable
- `@Roles()` + `RolesGuard` for coarse access; ownership checked in services
- Login cannot enumerate accounts — same message and same timing on every failure
- `POST /api/auth/{register,login,refresh,logout,logout-all}`
- `GET|PATCH /api/users/me`, `PATCH /api/users/:id/role` (admin only)

## ✅ 3. Restaurants, menus, orders

- Restaurants owned by `restaurant_owner`; menu **categories** and **items**
- `GET /api/restaurants/:id/menu` — the restaurant page in two queries
- Orders priced **server-side** from the menu; no price field exists on any DTO
- Line items snapshot name and price, so a menu change can't rewrite history
- Status state machine (`src/modules/orders/order-status.ts`) — declares every
  legal transition and who may make it; separates 409 (illegal) from 403 (not yours)
- Conditional writes for status changes and courier claims — concurrent actors
  produce one winner and one 409, never a silent overwrite

## ✅ 4. Browse & discovery

Letting a signed-in (or signed-out) user actually find somewhere to eat.

- ✅ Restaurant profile: coordinates, cuisines, price level, rating, prep
  time, minimum order, image
- ✅ Saved addresses (`/api/addresses`), one default per user — enforced by a
  **partial unique index**, not by remembering to clear the old one
- ✅ Nearby search: bounding-box prefilter on the indexed lat/lng, then exact
  great-circle distance. `acos` input is clamped, so float rounding on two
  near-identical points can't blow up the query
- ✅ Quality ranking with no location — **Bayesian-smoothed** (prior: 20
  ratings at 4.2), so a 4.9-from-8-reviews can't outrank a 4.7-from-1,240
- ✅ Text search over name, description and cuisine; user-typed `%` and `_`
  are escaped so they can't silently match everything
- ✅ Filters: cuisine (array overlap, GIN), price level, min rating, max
  delivery fee, open now, city, radius
- ✅ Sorts: distance, rating, deliveryFee, prepTime, popularity — every one
  tie-broken by the smoothed score, then by id so pages never repeat a row
- ✅ `PaginatedDto` envelope with a real `total` and `hasMore`
- ✅ Seed data: 10 London restaurants, 25 categories, 63 items, 4 accounts

**Ranking rules**

| Caller | Origin | Default order |
|---|---|---|
| Sent `latitude`/`longitude` | those coordinates | nearest first |
| Signed in, has a default address | that address | nearest first |
| Signed in, no address | none | best-rated (smoothed) |
| Signed out | none | best-rated (smoothed) |

```bash
pnpm db:migrate && pnpm db:seed
```

Seed accounts are all `<role>@ember.seed`, password `seed password 123`.
The script only ever touches that domain, so it cannot harm real data.

**Verified live against the Neon dev branch** — 10 restaurants seeded, every
filter and sort executed, distance ranking confirmed from two saved addresses.

## ✅ 4a. Schema drift detection

Found while seeding: the database was migrated to `0002` while the code
expected `0003`. The old health check looked only for the `users` table, so it
reported `schema: ready` and the failure surfaced as an opaque insert error.

`GET /` now compares **every table and column Drizzle declares** against
`information_schema` and reports `ready` / `outdated` / `missing`, naming
what's absent. Derived from the schema itself, so it can't go stale.

## ✅ 5. Reviews & ratings

Ratings are real now — the seeded numbers are replaced the moment a restaurant
gets its first genuine review.

- `POST /api/orders/:orderId/review`, `GET /api/restaurants/:id/reviews`
- **One review per delivered order**, enforced by a unique index on `order_id`.
  Reviewing something you never ordered is impossible by construction, and
  two concurrent submissions produce one review and one 409
- Three gates: uninvolved → 404, involved but not the customer → 403 (a
  courier delivered it, which is not the same as having eaten it), not yet
  delivered → 409
- `rating` is checked in the DTO *and* by a `CHECK (rating between 1 and 5)`,
  so a 6-star review cannot exist however the row was written
- `ratingAverage`/`ratingCount` recomputed **in the same transaction** as the
  insert, with `AVG()` over the real rows rather than an incremental nudge —
  exact under concurrency, and still correct if a review is ever deleted
- Immutable for now: no edit or delete endpoint

**Verified live** — placed a real order, drove it through the full status
machine to `delivered`, then reviewed it. Green Bowl went from its seeded
`4.4 (540)` to `2.0 (1)`.

## ✅ 5a. Constraint violations returned 500, not 409

Caught by the live smoke test, invisible to the unit tests.

Drizzle does not rethrow the `pg` error — it raises its own `Failed query: …`
Error with the driver error on `.cause`. `isUniqueViolation` only inspected the
top level, so **every** 409 translation in the app was falling through to a 500:
duplicate registration, duplicate phone, duplicate category name, duplicate
review. It now walks the cause chain.

The mocked tests all passed throughout, because they constructed the error
shape the code assumed rather than the one Drizzle produces.

## ✅ 6. Cart

- One basket per customer, enforced by a **unique index on `user_id`** — not a
  convention a service has to remember
- **No money stored anywhere in the cart.** Prices are read from the menu on
  every view and again at checkout, so a price change or a sold-out dish shows
  up before the customer commits, not on the receipt
- Adding the same dish increments via **upsert** on `(cart_id, menu_item_id)`,
  so two rapid taps sum to two instead of racing to one
- A dish from another restaurant is a 409 naming the current one, so the client
  can offer "start a new basket?"
- Sold-out lines stay visible but contribute nothing to the total
- `blockers[]` + `canCheckout` tell the client exactly why the button is off
- Checkout delegates to `OrdersService.create`, so pricing lives in one place,
  and **clears the basket only after the order exists**
- Minimum order enforced in `OrdersService`, not just the cart — posting
  straight to `/orders` can't slip under it

```
GET    /api/cart
POST   /api/cart/items               add or increment
PATCH  /api/cart/items/:menuItemId   exact quantity; 0 removes
DELETE /api/cart/items/:menuItemId
DELETE /api/cart                     empty it
POST   /api/cart/checkout            → order, then empties
```

**Verified live against Neon** — add, increment, cross-restaurant rejection,
below-minimum block, checkout, basket emptied.

## ✅ 7. Payments

Built against a **provider interface**, not a provider. `PaymentsService` owns
every decision — eligibility, amount, idempotency, state — and the adapter only
moves money, so Stripe is one new class bound in `PaymentsModule`.

- **Idempotency keys with a unique index.** A timeout is indistinguishable from
  a failure client-side, so retries are guaranteed; retrying with the same key
  returns the original result instead of charging twice. Two racing requests
  collide on the index *before* the provider is contacted.
- **The amount is the order total.** No amount field exists on any payment DTO.
- **A kitchen cannot confirm an unpaid order** — `orders.paidAt` is set inside
  the same transaction that captures the payment. Orders reads its own column,
  so it never depends on the payments module and there is no cycle.
- Refunds only on cancelled orders; refunding clears `paidAt`.
- `authorize` and `capture` stay distinct calls even though delivery captures
  immediately, so "capture on delivery" becomes a resequencing, not a migration.
- `FakePaymentProvider` approves everything except two magic amounts (1301,
  1302), the way Stripe reserves test cards — the failure paths are reachable
  with no account.

```
POST /api/orders/:orderId/payment          pay (idempotencyKey required)
GET  /api/orders/:orderId/payment
POST /api/orders/:orderId/payment/refund
```

**Verified live against Neon** — confirm-before-paying blocked, payment
captured, retry returned the same payment, confirm then allowed, refund
cleared `paidAt`, double-refund rejected.

### To switch to Stripe

Write `StripePaymentProvider implements PaymentProvider` and change the one
binding in `PaymentsModule`. Nothing in the service, schema or routes moves.
A webhook endpoint is the remaining piece, and it needs a public URL — so it
lands after deployment.

## ⬜ 8. Live delivery tracking ← **next**

Courier location updates, WebSocket or SSE feed for the customer.

---

## Deploying to Vercel

Zero-config: Vercel detects `src/main.ts` and runs the whole app as one
Function on Fluid compute. `app.listen()` stays as-is.

**Environment variables to set in the Vercel project** (Settings → Environment
Variables). The first two are required; the rest are wrong-by-default on
serverless:

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL (`-pooler` in the host) | Each instance opens its own pool; the direct endpoint runs out of connections |
| `JWT_ACCESS_SECRET` | 32+ chars | Required; boot fails without it |
| `TRUST_PROXY` | `1` | **Without this every request looks like it came from Vercel's proxy**, so the rate limiter throttles all users as one — 5 logins per minute globally |
| `DATABASE_POOL_MAX` | `2`–`5` | 10 per instance × many instances exhausts Neon |
| `SWAGGER_ENABLED` | `true` | Off in production by default; needed to browse `/docs` |
| `CORS_ORIGINS` | your frontend origin | Empty means same-origin only |
| `NODE_ENV` | `production` | |

```bash
vercel deploy          # preview
vercel deploy --prod   # production
```

**Migrations do not run on deploy.** Run `pnpm db:migrate` yourself against the
branch before the first deploy and after any schema change; `GET /` reports
`schema: outdated` and names what is missing if you forget.

### Known serverless caveats

- **Rate limiting is per-instance.** `@nestjs/throttler` keeps counters in
  memory, so the effective limit is roughly `THROTTLE_LIMIT` × instance count.
  A shared store (Upstash Redis) is the real fix when it matters.
- **Set the Function region near your Neon region.** A mismatch adds a
  round-trip's latency to every single query.
- `argon2` is native; it is listed in `pnpm-workspace.yaml` `allowBuilds` so
  the install script runs on a clean CI installer. Removing it there means
  auth compiles fine and throws at runtime.

## Standing debt

- **E2E tests are written but never run** — they need a live database.
  `DATABASE_URL=<throwaway> pnpm db:migrate && pnpm test:e2e`. Don't point them
  at the dev branch: they create and delete rows.
- **`.env.example` is stale** — it lists none of the current variables. Blocked
  by a local permission rule; needs a human to write it.
- **Search uses `ILIKE`.** Correct and index-assisted for prefixes, but a
  leading-wildcard match scans. Move to `pg_trgm` + GIN when the table grows
  past a few thousand rows.
- **Ratings are denormalised** onto `restaurants`, kept true by
  `ReviewsRepository.createAndRecompute`. Any future path that writes or
  deletes a review owns the same recompute.
- **Seeded ratings are fiction** until a restaurant gets a real review, at
  which point the placeholder is replaced wholesale. Fine for development,
  worth clearing before anything resembling production.
- **Prefer a live smoke test over more mocks.** The 409-vs-500 bug sat behind
  four passing unit tests; one real request found it in seconds.
