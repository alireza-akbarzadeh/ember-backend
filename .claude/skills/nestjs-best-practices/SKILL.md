---
name: nestjs-best-practices
description: Dependency injection, error handling, security, performance, testing and API-design conventions for this NestJS backend. Use when writing guards/strategies/interceptors/pipes, adding authentication or input validation, writing unit or e2e tests, or reviewing NestJS code for anti-patterns. For module file layout use nestjs-module; for schema/queries use drizzle-schema.
---

# NestJS best practices

Conventions for `ember-backend` (NestJS 11, Drizzle ORM, PostgreSQL, Jest 30, pnpm).
This complements `nestjs-module` (layout/DI wiring) and `drizzle-schema` (tables/queries) —
read those first for structural questions. This skill covers what happens *inside* the layers.

## Dependency injection

- **Constructor injection only.** No property injection (`@Inject()` on a class
  field), no service locators (`moduleRef.get(...)` outside factory providers
  or dynamic lookups that genuinely need it).
- **Depend on interfaces via tokens when a provider has multiple implementations**
  (e.g. swapping a real payment gateway for a fake in tests). For a single
  concrete implementation, just inject the class — a token is ceremony with no
  payoff.

  ```ts
  export const MAIL_SENDER = Symbol('MAIL_SENDER');

  { provide: MAIL_SENDER, useClass: SesMailSender }
  constructor(@Inject(MAIL_SENDER) private readonly mail: MailSender) {}
  ```

- **Know the scopes.** Providers are singletons by default — one instance for
  the whole app. Only use `Scope.REQUEST` when a provider genuinely needs
  per-request state (e.g. the current user from a request-scoped guard
  context); it disables most of Nest's DI caching and is measurably slower.
  Don't reach for it out of caution.
- **A circular `forwardRef()` between services in different modules is a
  boundary problem**, not something to route around — see `arch-avoid-circular-deps`
  in `nestjs-module`.

## Error handling

- **Throw, don't return, errors.** Services throw Nest's built-in
  `HttpException` subclasses; controllers never construct error bodies by
  hand and repositories never throw HTTP exceptions (they return `null` for
  "not found" — see `drizzle-schema`).

  ```ts
  const [order] = await this.repo.findById(id);
  if (!order) throw new NotFoundException(`Order ${id} not found`);
  if (order.userId !== currentUserId) throw new ForbiddenException();
  ```

- **A global exception filter is not wired yet.** When error responses need a
  consistent shape (e.g. `{ statusCode, message, error }` is already Nest's
  default — only add a filter if you need to change it, log every exception
  centrally, or translate a specific class of error like Drizzle/Postgres
  constraint violations into `ConflictException`):

  ```ts
  @Catch()
  export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) { /* ... */ }
  }
  // main.ts
  app.useGlobalFilters(new AllExceptionsFilter());
  ```

- **Never let a rejected promise reach Nest un-awaited.** `pnpm lint`'s
  `recommendedTypeChecked` config catches floating promises — don't silence
  it with `void` unless the fire-and-forget is intentional and documented.
- **Never leak internals in an error message** sent to the client: no SQL,
  no stack traces, no `error.message` from a driver-level exception. Catch,
  log the real error server-side, throw a clean `HttpException`.

## Security

- **Validation is not wired yet** (see `nestjs-module` for the
  `class-validator` + global `ValidationPipe` setup — do that before trusting
  any DTO). Once it exists, every external-input DTO gets validated; nothing
  bypasses the global pipe.
- **Auth scaffolding exists but is empty** (`src/modules/auth/{guards,strategies,decorators}`
  contain no files yet). When implementing it:
  - A `JwtStrategy` (Passport) or equivalent lives in `strategies/`, an
    `AuthGuard` in `guards/`, and a `@CurrentUser()` param decorator in
    `decorators/` — don't pull the user back out of `request.headers` by hand
    in controllers.
  - Protect every mutating/sensitive route with an explicit guard; don't rely
    on "it's behind the gateway" or a convention that's easy to forget on one
    controller.
  - **Authorization is a second check, not implied by authentication.**
    `GET /orders/:id` needs `order.userId === req.user.id` (or a permission
    check) inside the service — never trust an ID the client sent as proof of
    ownership.
- **Never trust client-supplied privileged fields.** `role`, `isAdmin`,
  `userId`, `price`, `status` on an incoming DTO must be ignored/overwritten
  server-side, not merged in from the request body. This is what `whitelist:
  true` on the `ValidationPipe` partially defends, but explicit DTOs (no
  `role` field on `CreateUserDto`) are the real guard.
- **Rate limiting** isn't configured yet (no `@nestjs/throttler` dependency).
  Add it before any public-facing auth/mutation endpoint ships, not after an
  incident.
- **Passwords are hashed, never logged, never returned.** Select explicit
  columns from `users` (see `drizzle-schema`) so `passwordHash` can't leak
  into a response by accident.

## Performance

- **`Promise.all` for independent async work**, sequential `await` when one
  call depends on another's result or when running them concurrently would
  create a consistency problem (e.g. two writes that must observe each
  other's effects).
- **Avoid N+1s.** Prefer Drizzle's relational query API (`db.query.<table>.findMany({ with })`)
  or an explicit join over looping a list and querying per row.
- **Lifecycle hooks (`OnModuleInit`, `OnApplicationBootstrap`) should stay
  fast and non-blocking.** A slow `onModuleInit` delays app startup and, in
  container orchestration, can trip readiness-probe timeouts.
- **Cache only when there's a measured cost to avoid** (a slow external call,
  a hot read-heavy query) — don't add `@nestjs/cache-manager` speculatively.

## Testing

- **Unit tests** use `Test.createTestingModule` and mock the layer below the
  thing under test (service tests mock the repository; controller tests mock
  the service). Don't spin up a real DB connection for a unit test.

  ```ts
  const module = await Test.createTestingModule({
    providers: [OrdersService, { provide: OrdersRepository, useValue: mockRepo }],
  }).compile();
  ```

- **E2E tests** (`test/*.e2e-spec.ts`, run via `pnpm test:e2e`) boot the real
  `AppModule` and hit routes with Supertest. Cover: happy path, validation
  failure, unauthenticated request, unauthorized (wrong-owner) request,
  not-found.
- **No test currently exercises the database.** When a repository or a
  service with non-trivial queries is added, prefer a real Postgres instance
  (test database / testcontainer) over mocking Drizzle's query builder —
  mocked query chains pass while the real SQL is wrong.
- Tests must be deterministic: no dependency on execution order, no shared
  mutable fixtures between tests, clean up any rows a test creates.

## API design

- **DTOs are the contract**, not the Drizzle row type. A `UserResponseDto`
  (or a `ClassSerializerInterceptor` + `@Exclude()` on `passwordHash`) keeps
  a schema change from silently changing the API response.
- **Interceptors for cross-cutting concerns** (response shaping, logging,
  timing) — not business logic. If an interceptor starts making authorization
  decisions, that logic belongs in a guard or the service instead.
- **Pipes transform/validate input** (`ParseUUIDPipe` on a route param,
  `ValidationPipe` on the body) — they shouldn't reach into the database.
- **No versioning scheme is in place yet.** If/when it's needed, prefer
  Nest's built-in URI versioning (`app.enableVersioning()`) over hand-rolled
  `/v2` routes so old and new controllers can coexist during a migration.

## Config & deployment

- All config goes through `ConfigService` (already global via
  `ConfigModule.forRoot({ isGlobal: true })` in `app.module.ts`) — never
  `process.env` outside `main.ts`. Use `config.getOrThrow(...)` for anything
  the app cannot run without.
- **No structured logging yet** (`console.log` / Nest's default `Logger`).
  Before adding a logging library, check whether Nest's built-in `Logger`
  with a custom `LoggerService` covers the need — don't add Winston/Pino
  speculatively.
- **Graceful shutdown**: `app.enableShutdownHooks()` isn't called in
  `main.ts` yet. Add it before deploying somewhere that sends `SIGTERM` on
  redeploy (most container platforms), so in-flight requests and the DB pool
  drain cleanly.

## Checks

Run before calling anything in this area done:

```bash
pnpm lint && pnpm test
```

Add `pnpm test:e2e` when the change touches a controller/route, and
`pnpm build` when it touches config or module wiring.
